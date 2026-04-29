// for workflow template, dashboard data endpoint for emails page. loads campaigns, donations etc

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { EmailAutomationController } from '@/app/controller/EmailAutomationController'
import { EmailLog, type EmailLogSummary } from '@/app/entity/EmailLog'
import type { EmailTriggerKey, EmailAutomationRuleSummary } from '@/app/entity/EmailAutomationRule'
import type { EmailTemplateSummary } from '@/app/entity/EmailTemplate'
import type { Campaign, Donation, User } from '@/lib/types'

const defaultsController = new EmailAutomationController([], [], [])
const defaultRules = defaultsController.createDefaultRules()
const defaultTemplates = defaultsController.createDefaultTemplates()

const fallbackDescriptions: Record<EmailTriggerKey, string> = Object.fromEntries(
  defaultRules.map((rule) => [rule.key, rule.description])
) as Record<EmailTriggerKey, string>

const fallbackLabels: Record<EmailTriggerKey, string> = Object.fromEntries(
  defaultTemplates.map((template) => [template.ruleKey, template.label])
) as Record<EmailTriggerKey, string>

const fallbackTemplateDescriptions: Record<EmailTriggerKey, string> = Object.fromEntries(
  defaultTemplates.map((template) => [template.ruleKey, template.description])
) as Record<EmailTriggerKey, string>

function normaliseRuleKey(triggerType: string | null | undefined): EmailTriggerKey | null {
  switch (triggerType) {
    case 'campaign_update':
    case 'manual_update':
      return 'manual_update'
    case 'donation_received':
    case 'thank_you':
      return 'thank_you'
    case 'milestone':
    case 'milestone_50':
      return 'milestone'
    case 'new_donation_alert':
    case 'donation_alert':
      return 'new_donation_alert'
    default:
      return null
  }
}

function toTriggerType(ruleKey: EmailTriggerKey): string {
  switch (ruleKey) {
    case 'manual_update':
      return 'campaign_update'
    case 'thank_you':
      return 'donation_received'
    case 'milestone':
      return 'milestone_50'
    case 'new_donation_alert':
    default:
      return 'new_donation_alert'
  }
}

function toDateOnly(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return new Date(value as string | number | Date).toISOString().slice(0, 10)
}

function toIsoString(value: unknown): string {
  if (!value) return new Date(0).toISOString()
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
  }
  return new Date(value as string | number | Date).toISOString()
}

function toPositiveInt(input: string | null, fallback: number, max?: number) {
  const parsed = Number.parseInt(input || '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  if (typeof max === 'number') return Math.min(parsed, max)
  return parsed
}

async function getWorkflowRows() {
  try {
    return await prisma.emailAutomationRule.findMany()
  } catch {
    return [] as Array<{
      id: string
      name: string
      triggerType: string
      isActive: boolean
      subject: string
      body: string
    }>
  }
}

function mergeWorkflowState(
  workflowRows: Array<{
    id: string
    name: string
    triggerType: string
    isActive: boolean
    subject: string
    body: string
  }>
): { rules: EmailAutomationRuleSummary[]; templates: EmailTemplateSummary[]; ruleIdToKey: Map<string, EmailTriggerKey> } {
  const rulesByKey = new Map(defaultRules.map((rule) => [rule.key, { ...rule }]))
  const templatesByKey = new Map(defaultTemplates.map((template) => [template.ruleKey, { ...template }]))
  const ruleIdToKey = new Map<string, EmailTriggerKey>()

  for (const row of workflowRows) {
    const ruleKey = normaliseRuleKey(row.triggerType)
    if (!ruleKey) continue

    ruleIdToKey.set(row.id, ruleKey)

    const existingRule = rulesByKey.get(ruleKey)
    if (existingRule) {
      rulesByKey.set(ruleKey, {
        ...existingRule,
        id: row.id || existingRule.id,
        key: ruleKey,
        label: row.name || existingRule.label,
        description: fallbackDescriptions[ruleKey],
        isEnabled: Boolean(row.isActive),
      })
    }

    const existingTemplate = templatesByKey.get(ruleKey)
    if (existingTemplate) {
      templatesByKey.set(ruleKey, {
        ...existingTemplate,
        id: row.id || existingTemplate.id,
        ruleKey,
        label: row.name || fallbackLabels[ruleKey],
        description: fallbackTemplateDescriptions[ruleKey],
        subjectTemplate: row.subject || existingTemplate.subjectTemplate,
        bodyTemplate: row.body || existingTemplate.bodyTemplate,
        updatedAt: undefined,
      })
    }
  }

  return {
    rules: defaultRules.map((rule) => rulesByKey.get(rule.key) || rule),
    templates: defaultTemplates.map((template) => templatesByKey.get(template.ruleKey) || template),
    ruleIdToKey,
  }
}

async function buildResponsePayload(request: Request, fundRaiserId: string) {
  const url = new URL(request.url)
  const logsPage = toPositiveInt(url.searchParams.get('logsPage'), 1)
  const logsPageSize = toPositiveInt(url.searchParams.get('logsPageSize'), 10, 50)
  const logsStatus = url.searchParams.get('logsStatus') || 'all'
  const logsSort = url.searchParams.get('logsSort') === 'oldest' ? 'oldest' : 'newest'
  const logsCampaignId = url.searchParams.get('logsCampaignId') || 'all'

  const fundRaiser = await prisma.user.findUnique({
    where: { id: fundRaiserId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      phone: true,
      location: true,
      avatar: true,
      bio: true,
      isVerified: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
    },
  })

  if (!fundRaiser) {
    throw new Error('Fund raiser account was not found.')
  }

  const rawCampaigns = await prisma.campaign.findMany({
    where: { organiserId: fundRaiserId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      summary: true,
      description: true,
      category: true,
      serviceType: true,
      status: true,
      targetAmount: true,
      raisedAmount: true,
      donorCount: true,
      views: true,
      favouriteCount: true,
      startDate: true,
      endDate: true,
      beneficiaryName: true,
      beneficiaryRelationship: true,
      beneficiaryDescription: true,
      coverImage: true,
      location: true,
      createdAt: true,
      completedAt: true,
    },
  })

  const campaignIds = rawCampaigns.map((campaign) => campaign.id)

  const rawUpdates = campaignIds.length
    ? await prisma.campaignUpdate.findMany({
        where: { campaignId: { in: campaignIds } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          campaignId: true,
          title: true,
          content: true,
          createdAt: true,
        },
      })
    : []

  const updatesByCampaignId = new Map<string, Array<{ id: string; campaignId: string; title: string; content: string; createdAt: string }>>()
  for (const update of rawUpdates) {
    const current = updatesByCampaignId.get(update.campaignId) || []
    current.push({
      id: update.id,
      campaignId: update.campaignId,
      title: update.title,
      content: update.content,
      createdAt: toIsoString(update.createdAt),
    })
    updatesByCampaignId.set(update.campaignId, current)
  }

  const totalRaised = rawCampaigns.reduce((sum, campaign) => sum + Number(campaign.raisedAmount || 0), 0)

  const currentUser: User = {
    id: fundRaiser.id,
    email: fundRaiser.email,
    displayName: `${fundRaiser.firstName} ${fundRaiser.lastName}`.trim(),
    firstName: fundRaiser.firstName,
    lastName: fundRaiser.lastName,
    role: fundRaiser.role,
    phone: fundRaiser.phone || undefined,
    location: fundRaiser.location || undefined,
    avatar: fundRaiser.avatar || undefined,
    bio: fundRaiser.bio || undefined,
    isVerified: fundRaiser.isVerified,
    status: fundRaiser.status,
    createdAt: toIsoString(fundRaiser.createdAt),
    lastLoginAt: fundRaiser.lastLoginAt ? toIsoString(fundRaiser.lastLoginAt) : undefined,
  }

  const campaigns: Campaign[] = rawCampaigns.map((campaign) => ({
    id: campaign.id,
    title: campaign.title,
    summary: campaign.summary,
    description: campaign.description,
    category: campaign.category,
    serviceType: campaign.serviceType,
    status: campaign.status,
    targetAmount: Number(campaign.targetAmount || 0),
    raisedAmount: Number(campaign.raisedAmount || 0),
    donorCount: Number(campaign.donorCount || 0),
    views: Number(campaign.views || 0),
    favouriteCount: Number(campaign.favouriteCount || 0),
    startDate: toDateOnly(campaign.startDate),
    endDate: toDateOnly(campaign.endDate),
    organiser: {
      id: currentUser.id,
      name: currentUser.displayName,
      avatar: currentUser.avatar,
      isVerified: currentUser.isVerified,
      totalCampaigns: rawCampaigns.length,
      totalRaised,
    },
    beneficiary: {
      name: campaign.beneficiaryName,
      relationship: campaign.beneficiaryRelationship || undefined,
      description: campaign.beneficiaryDescription || undefined,
    },
    coverImage: campaign.coverImage || '',
    gallery: [],
    updates: updatesByCampaignId.get(campaign.id) || [],
    createdAt: toIsoString(campaign.createdAt),
    completedAt: campaign.completedAt ? toIsoString(campaign.completedAt) : undefined,
    location: campaign.location || undefined,
  }))

  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))

  const rawDonations = campaignIds.length
    ? await prisma.donation.findMany({
        where: { campaignId: { in: campaignIds } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          campaignId: true,
          donorId: true,
          donorName: true,
          donorEmail: true,
          amount: true,
          message: true,
          isAnonymous: true,
          status: true,
          createdAt: true,
        },
      })
    : []

  const donorIds = Array.from(new Set(rawDonations.map((donation) => donation.donorId).filter((value): value is string => Boolean(value))))

  const donorUsers = donorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: donorIds } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          location: true,
          avatar: true,
          bio: true,
          isVerified: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
        },
      })
    : []

  const users: User[] = [
    currentUser,
    ...donorUsers.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      phone: user.phone || undefined,
      location: user.location || undefined,
      avatar: user.avatar || undefined,
      bio: user.bio || undefined,
      isVerified: user.isVerified,
      status: user.status,
      createdAt: toIsoString(user.createdAt),
      lastLoginAt: user.lastLoginAt ? toIsoString(user.lastLoginAt) : undefined,
    })),
  ]

  const donations: Donation[] = rawDonations.map((donation) => {
    const campaign = campaignById.get(donation.campaignId)
    return {
      id: donation.id,
      campaignId: donation.campaignId,
      campaignTitle: campaign?.title || 'Campaign',
      campaignImage: campaign?.coverImage || '',
      category: campaign?.category || 'General',
      donorId: donation.donorId || `anonymous-${donation.id}`,
      donorName: donation.isAnonymous ? 'Anonymous' : donation.donorName || 'Unknown donor',
      amount: Number(donation.amount || 0),
      message: donation.message || undefined,
      isAnonymous: Boolean(donation.isAnonymous),
      status: donation.status,
      createdAt: toIsoString(donation.createdAt),
    }
  })

  const workflowRows = await getWorkflowRows()
  const { rules, templates, ruleIdToKey } = mergeWorkflowState(workflowRows)

  const logWhere: Record<string, unknown> = {
    ...(logsCampaignId !== 'all' ? { campaignId: logsCampaignId } : campaignIds.length ? { OR: [{ campaignId: { in: campaignIds } }, { recipientEmail: currentUser.email }] } : { recipientEmail: currentUser.email }),
    ...(logsStatus !== 'all' ? { status: logsStatus } : {}),
  }

  const [rawLogs, totalLogs] = await Promise.all([
    prisma.emailLog.findMany({
      where: logWhere,
      orderBy: { sentAt: logsSort === 'oldest' ? 'asc' : 'desc' },
      skip: (logsPage - 1) * logsPageSize,
      take: logsPageSize,
      select: {
        id: true,
        templateId: true,
        recipientEmail: true,
        subject: true,
        body: true,
        status: true,
        campaignId: true,
        sentAt: true,
      },
    }),
    prisma.emailLog.count({ where: logWhere }),
  ])

  const logs: EmailLogSummary[] = rawLogs.map((log) => {
    const mappedRuleKey = log.templateId ? ruleIdToKey.get(log.templateId) || 'manual_update' : 'manual_update'
    const campaign = log.campaignId ? campaignById.get(log.campaignId) : undefined
    const recipientEmail = log.recipientEmail || undefined

    return new EmailLog({
      id: log.id,
      ruleKey: mappedRuleKey,
      recipientType: recipientEmail === currentUser.email ? 'fund_raiser' : 'donor',
      recipientName: recipientEmail || 'Unknown recipient',
      recipientEmail,
      subject: log.subject,
      status: log.status,
      sentAt: toIsoString(log.sentAt),
      campaignId: log.campaignId || undefined,
      campaignTitle: campaign?.title,
    }).toSummary()
  })

  return {
    currentUser,
    campaigns,
    donations,
    users,
    rules,
    templates,
    logs,
    logsMeta: {
      page: logsPage,
      pageSize: logsPageSize,
      totalCount: totalLogs,
      totalPages: Math.max(1, Math.ceil(totalLogs / logsPageSize)),
      status: logsStatus,
      sort: logsSort,
      campaignId: logsCampaignId,
    },
    logFilters: {
      statusOptions: ['all', 'sent', 'queued', 'failed'],
      sortOptions: ['newest', 'oldest'],
    },
  }
}

export async function GET(request: Request) {
  const session = await getSession()

  if (!session || session.role !== 'fund_raiser') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await buildResponsePayload(request, session.id)
    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load email automation.' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  const session = await getSession()

  if (!session || session.role !== 'fund_raiser') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      action?: string
      ruleKey?: EmailTriggerKey
      isEnabled?: boolean
      subjectTemplate?: string
      bodyTemplate?: string
    }

    if (!body.action || !body.ruleKey) {
      return NextResponse.json({ error: 'Missing workflow action or rule key.' }, { status: 400 })
    }

    const defaultRule = defaultRules.find((rule) => rule.key === body.ruleKey)
    const defaultTemplate = defaultTemplates.find((template) => template.ruleKey === body.ruleKey)

    if (!defaultRule || !defaultTemplate) {
      return NextResponse.json({ error: 'Unknown workflow key.' }, { status: 400 })
    }

    const triggerTypes = [toTriggerType(body.ruleKey)]
    if (body.ruleKey === 'milestone') triggerTypes.push('milestone')
    if (body.ruleKey === 'manual_update') triggerTypes.push('manual_update')
    if (body.ruleKey === 'thank_you') triggerTypes.push('thank_you')

    const existing = await prisma.emailAutomationRule.findFirst({
      where: { triggerType: { in: triggerTypes } },
    })

    const nextRecord = {
      name: existing?.name || defaultTemplate.label,
      triggerType: existing?.triggerType || toTriggerType(body.ruleKey),
      isActive:
        body.action === 'toggle_rule'
          ? Boolean(body.isEnabled)
          : typeof existing?.isActive === 'boolean'
            ? existing.isActive
            : defaultRule.isEnabled,
      subject:
        body.action === 'reset_template'
          ? defaultTemplate.subjectTemplate
          : (body.subjectTemplate ?? existing?.subject ?? defaultTemplate.subjectTemplate),
      body:
        body.action === 'reset_template'
          ? defaultTemplate.bodyTemplate
          : (body.bodyTemplate ?? existing?.body ?? defaultTemplate.bodyTemplate),
    }

    if (existing) {
      await prisma.emailAutomationRule.update({
        where: { id: existing.id },
        data: nextRecord,
      })
    } else {
      await prisma.emailAutomationRule.create({
        data: nextRecord,
      })
    }

    const workflowRows = await getWorkflowRows()
    const { rules, templates } = mergeWorkflowState(workflowRows)

    return NextResponse.json({ rules, templates })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save workflow changes.' },
      { status: 500 }
    )
  }
}
