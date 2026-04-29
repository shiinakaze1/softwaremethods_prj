import {
  Donor,
  getDonorSegmentDescription,
  getDonorSegmentLabel,
  isDonorSegmentKey,
  type DonorSegmentKey,
  type DonorSummary,
} from "@/app/entity/Donor"
import { EmailGenerationRequest } from "@/app/entity/EmailGenerationRequest"
import { EmailDraft, type EmailDraftSummary, type EmailDraftPurpose, type EmailDraftTone } from "@/app/entity/EmailDraft"
import { EmailAutomationRule, type EmailAutomationRuleSummary } from "@/app/entity/EmailAutomationRule"
import { EmailLog, type EmailLogSummary } from "@/app/entity/EmailLog"
import {
  EmailTemplate,
  createDefaultEmailTemplates,
  type EmailTemplateSummary,
  type EmailTemplateUpdateInput,
} from "@/app/entity/EmailTemplate"
import { EmailWorkflowTrigger, type EmailWorkflowTriggerSummary } from "@/app/entity/EmailWorkflowTrigger"
import type { Campaign, Donation, User, CampaignUpdate } from "@/lib/types"

interface StoredUserLike {
  id?: string
  email?: string
}

interface BuildDashboardOptions {
  segment?: string | null
  campaignId?: string | null
}

export interface EmailAutomationStats {
  emailsSent: number
  donorEmailsSent: number
  fundRaiserEmailsSent: number
  activeRules: number
}

export interface EmailSegmentAudienceSummary {
  key: DonorSegmentKey
  label: string
  description: string
  recipientCount: number
  recipientsWithEmailCount: number
  recipients: Pick<DonorSummary, "donorId" | "donorName" | "donorEmail" | "totalDonated" | "donationCount">[]
}

export interface EmailSegmentOption {
  key: DonorSegmentKey
  label: string
  description: string
  recipientCount: number
  recipientsWithEmailCount: number
}

export interface WorkflowAudiencePreview {
  label: string
  description: string
  recipientType: "donor" | "fund_raiser"
  recipientCount: number
  recipientsWithEmailCount: number
}

export interface WorkflowItem {
  rule: EmailAutomationRuleSummary
  template?: EmailTemplateSummary
  audiencePreview: WorkflowAudiencePreview
  triggerSummary: EmailWorkflowTriggerSummary
}

export interface EmailAutomationViewModel {
  fundRaiserCampaigns: Campaign[]
  workflowItems: WorkflowItem[]
  logs: EmailLogSummary[]
  stats: EmailAutomationStats
  suggestedCampaignId?: string
  selectedSegment?: EmailSegmentAudienceSummary
  segmentOptions: EmailSegmentOption[]
}

interface GenerateAiDraftInput {
  campaign?: Campaign
  selectedSegment?: EmailSegmentAudienceSummary
  purpose: EmailDraftPurpose
  tone: EmailDraftTone
  variationIndex?: number
  additionalPrompt?: string
  customPurposeText?: string
}

interface CreateManualAudienceEmailLogInput {
  draft: EmailDraftSummary
  campaign?: Campaign
  selectedSegment?: EmailSegmentAudienceSummary
  deliveryMode: "send" | "queue"
}

interface CreateAutomaticWorkflowEmailLogInput {
  ruleKey: EmailAutomationRuleSummary["key"]
  templateSummary?: EmailTemplateSummary
  fundRaiserUser: User
  campaign?: Campaign
  deliveryMode: "send" | "queue"
  logs?: EmailLogSummary[]
}

interface SendEmailRoutePayload {
  to: string[]
  subject: string
  text: string
  campaignId?: string
  campaignTitle?: string
  triggerKey?: EmailAutomationRuleSummary["key"]
  useConfiguredSenderAsRecipient?: boolean
}

export interface EmailDeliveryResult {
  log: EmailLogSummary
  deliveredCount: number
}

export class EmailAutomationController {
  private readonly savedDraftStoragePrefix = "fundbridge:email-ai-drafts"
  private readonly milestoneThresholds = [25, 50, 75, 100]

  constructor(
    private readonly campaigns: Campaign[],
    private readonly donations: Donation[],
    private readonly users: User[]
  ) {}

  getDefaultFundRaiserUser(): User | undefined {
    return this.users.find((user) => user.role === "fund_raiser")
  }

  resolveFundRaiserUser(storedUser: StoredUserLike): User | undefined {
    return this.users.find((user) => user.id === storedUser.id || user.email === storedUser.email)
  }

  createDefaultRules(): EmailAutomationRuleSummary[] {
    return [
      new EmailAutomationRule({
        id: "rule-campaign-update",
        key: "manual_update",
        label: "Campaign update",
        description: "Automatically send a donor update when a new campaign update is posted.",
        audience: "donor",
        isEnabled: true,
      }).toSummary(),
      new EmailAutomationRule({
        id: "rule-thank-you",
        key: "thank_you",
        label: "Thank you",
        description: "Automatically send a thank-you email after each completed donation.",
        audience: "donor",
        isEnabled: true,
      }).toSummary(),
      new EmailAutomationRule({
        id: "rule-milestone",
        key: "milestone",
        label: "Milestone update",
        description: "Automatically send a milestone email when the campaign crosses 25%, 50%, 75%, or 100%.",
        audience: "donor",
        isEnabled: true,
      }).toSummary(),
      new EmailAutomationRule({
        id: "rule-new-donation-alert",
        key: "new_donation_alert",
        label: "New donation alert",
        description: "Automatically send a notification to the fund raiser when a completed donation is received.",
        audience: "fund_raiser",
        isEnabled: true,
      }).toSummary(),
    ]
  }

  createDefaultTemplates(): EmailTemplateSummary[] {
    return createDefaultEmailTemplates()
  }

  toggleRule(rules: EmailAutomationRuleSummary[], ruleId: string): EmailAutomationRuleSummary[] {
    return rules.map((ruleSummary) => {
      const rule = new EmailAutomationRule(ruleSummary)
      if (rule.getId() === ruleId) {
        rule.toggle()
      }
      return rule.toSummary()
    })
  }

  updateTemplate(
    templates: EmailTemplateSummary[],
    ruleKey: EmailTemplateSummary["ruleKey"],
    updates: EmailTemplateUpdateInput
  ): EmailTemplateSummary[] {
    return templates.map((templateSummary) => {
      const template = new EmailTemplate(templateSummary)
      if (template.getRuleKey() === ruleKey) {
        template.update(updates)
      }
      return template.toSummary()
    })
  }

  resetTemplate(
    templates: EmailTemplateSummary[],
    ruleKey: EmailTemplateSummary["ruleKey"]
  ): EmailTemplateSummary[] {
    const defaults = this.createDefaultTemplates()
    return templates.map((templateSummary) => {
      if (templateSummary.ruleKey !== ruleKey) return templateSummary
      return defaults.find((item) => item.ruleKey === ruleKey) ?? templateSummary
    })
  }

  buildDashboard(
    fundRaiserUserId: string,
    rules: EmailAutomationRuleSummary[],
    templates: EmailTemplateSummary[],
    logs: EmailLogSummary[] = [],
    options?: BuildDashboardOptions
  ): EmailAutomationViewModel {
    const fundRaiserCampaigns = this.campaigns.filter((campaign) => campaign.organiser.id === fundRaiserUserId)
    const selectedCampaignId =
      options?.campaignId && fundRaiserCampaigns.some((campaign) => campaign.id === options.campaignId)
        ? options.campaignId
        : fundRaiserCampaigns[0]?.id

    const fundRaiserUser = this.users.find((user) => user.id === fundRaiserUserId)
    const selectedSegment = this.buildSelectedSegment(
      fundRaiserCampaigns,
      options?.segment ?? undefined,
      selectedCampaignId
    )

    return {
      fundRaiserCampaigns,
      workflowItems: rules.map((rule) => ({
        rule,
        template: templates.find((template) => template.ruleKey === rule.key),
        audiencePreview: this.buildWorkflowAudiencePreview(rule.key, fundRaiserCampaigns, selectedCampaignId, fundRaiserUser),
        triggerSummary: this.buildWorkflowTriggerSummary(rule.key, fundRaiserCampaigns, selectedCampaignId, logs, fundRaiserUser),
      })),
      logs: [...logs].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
      stats: this.buildStats(logs, rules),
      suggestedCampaignId: selectedCampaignId,
      selectedSegment,
      segmentOptions: this.buildSegmentOptions(fundRaiserCampaigns, selectedCampaignId),
    }
  }

  async sendQuickTestEmail(input: {
    ruleKey: EmailTemplateSummary["ruleKey"]
    templateSummary: EmailTemplateSummary | undefined
    fundRaiserUser: User
    campaign?: Campaign
    selectedSegment?: EmailSegmentAudienceSummary
  }): Promise<EmailDeliveryResult> {
    if (!input.templateSummary) {
      throw new Error("Please choose a workflow template before sending a quick test.")
    }

    const template = new EmailTemplate(input.templateSummary)
    const replacements = this.buildTemplateReplacements(
      input.fundRaiserUser,
      input.campaign,
      input.ruleKey === "new_donation_alert" ? undefined : input.selectedSegment
    )
    const subject = template.renderSubject(replacements)
    const body = template.renderBody(replacements)

    await this.sendEmailRequest({
      to: [],
      subject,
      text: body,
      campaignId: input.campaign?.id,
      campaignTitle: input.campaign?.title,
      triggerKey: input.ruleKey,
      useConfiguredSenderAsRecipient: true,
    })

    const log = new EmailLog({
      id: `manual-test-${input.ruleKey}-${Date.now()}`,
      ruleKey: input.ruleKey,
      recipientType: "fund_raiser",
      recipientName: "Configured SMTP inbox",
      recipientEmail: "EMAIL_SMTP_USER",
      subject,
      status: "sent",
      sentAt: new Date().toISOString(),
      campaignId: input.campaign?.id,
      campaignTitle: input.campaign?.title,
    }).toSummary()

    return {
      log,
      deliveredCount: 1,
    }
  }

  async deliverAutomaticWorkflowEmail(input: CreateAutomaticWorkflowEmailLogInput): Promise<EmailDeliveryResult> {
    const triggerSummary = this.buildWorkflowTriggerSummary(
      input.ruleKey,
      input.campaign ? [input.campaign] : [],
      input.campaign?.id,
      input.logs ?? [],
      input.fundRaiserUser
    )

    if (!triggerSummary.isReadyNow) {
      throw new Error(triggerSummary.statusReason)
    }

    const log = this.createAutomaticWorkflowEmailLog({ ...input, logs: input.logs })

    if (input.deliveryMode === "queue") {
      return {
        log,
        deliveredCount: 0,
      }
    }

    const templateSummary = input.templateSummary
    if (!templateSummary) {
      throw new Error("Please save or select a workflow template before sending this workflow.")
    }

    const recipients = this.getWorkflowRecipientEmails(input.ruleKey, input.campaign, input.fundRaiserUser)
    if (recipients.length <= 0) {
      throw new Error("There are no captured email addresses available for this workflow yet.")
    }

    const template = new EmailTemplate(templateSummary)
    const donorSegment = input.ruleKey === "thank_you"
      ? this.buildSelectedSegment(input.campaign ? [input.campaign] : [], "recent", input.campaign?.id)
      : undefined

    const subject = template.renderSubject(
      this.buildTemplateReplacements(
        input.fundRaiserUser,
        input.campaign,
        donorSegment,
        triggerSummary.thresholdLabel ? `${triggerSummary.thresholdLabel} milestone` : undefined
      )
    )
    const text = template.renderBody(
      this.buildTemplateReplacements(
        input.fundRaiserUser,
        input.campaign,
        donorSegment,
        triggerSummary.thresholdLabel ? `${triggerSummary.thresholdLabel} milestone` : undefined
      )
    )

    const deliveredCount = await this.sendEmailRequest({
      to: recipients,
      subject,
      text,
      campaignId: input.campaign?.id,
      campaignTitle: input.campaign?.title,
      triggerKey: input.ruleKey,
    })

    return { log, deliveredCount }
  }

  createAutomaticWorkflowEmailLog(input: CreateAutomaticWorkflowEmailLogInput): EmailLogSummary {
    if (!input.templateSummary) {
      throw new Error("Please choose a workflow template before sending or queueing this action.")
    }

    const triggerSummary = this.buildWorkflowTriggerSummary(
      input.ruleKey,
      input.campaign ? [input.campaign] : [],
      input.campaign?.id,
      input.logs ?? [],
      input.fundRaiserUser
    )

    if (!triggerSummary.isReadyNow) {
      throw new Error(triggerSummary.statusReason)
    }

    const template = new EmailTemplate(input.templateSummary)
    const donorSegment = input.ruleKey === "thank_you"
      ? this.buildSelectedSegment(input.campaign ? [input.campaign] : [], "recent", input.campaign?.id)
      : undefined

    const subject = template.renderSubject(
      this.buildTemplateReplacements(
        input.fundRaiserUser,
        input.campaign,
        donorSegment,
        triggerSummary.thresholdLabel ? `${triggerSummary.thresholdLabel} milestone` : undefined
      )
    )

    const status = input.deliveryMode === "send" ? "sent" : "queued"
    const audiencePreview = this.buildWorkflowAudiencePreview(
      input.ruleKey,
      input.campaign ? [input.campaign] : [],
      input.campaign?.id,
      input.fundRaiserUser
    )

    return new EmailLog({
      id: `workflow-${input.ruleKey}-${input.deliveryMode}-${Date.now()}`,
      ruleKey: input.ruleKey,
      recipientType: input.ruleKey === "new_donation_alert" ? "fund_raiser" : "donor",
      recipientName: `${audiencePreview.label} (${audiencePreview.recipientsWithEmailCount}/${audiencePreview.recipientCount} emails)`,
      subject,
      status,
      sentAt: new Date().toISOString(),
      campaignId: input.campaign?.id,
      campaignTitle: input.campaign?.title,
    }).toSummary()
  }

  async deliverManualAudienceEmail(input: CreateManualAudienceEmailLogInput): Promise<EmailDeliveryResult> {
    const log = this.createManualAudienceEmailLog(input)

    if (input.deliveryMode === "queue") {
      return {
        log,
        deliveredCount: 0,
      }
    }

    if (!input.campaign || !input.selectedSegment) {
      throw new Error("Please choose a campaign and donor segment before sending this update.")
    }

    const recipients = this.getSegmentRecipientEmails([input.campaign], input.selectedSegment.key, input.campaign.id)
    if (recipients.length <= 0) {
      throw new Error("The selected donor segment does not have any captured email addresses yet.")
    }

    const deliveredCount = await this.sendEmailRequest({
      to: recipients,
      subject: input.draft.subject,
      text: input.draft.body,
      campaignId: input.campaign.id,
      campaignTitle: input.campaign.title,
      triggerKey: "manual_update",
    })

    return {
      log,
      deliveredCount,
    }
  }

  createManualAudienceEmailLog(input: CreateManualAudienceEmailLogInput): EmailLogSummary {
    if (!input.campaign) {
      throw new Error("Please select a campaign before sending or queueing this update.")
    }

    if (!input.selectedSegment) {
      throw new Error("Please choose a donor segment before sending or queueing this update.")
    }

    if (input.selectedSegment.recipientCount <= 0) {
      throw new Error("The selected donor segment does not currently have any recipients.")
    }

    if (input.selectedSegment.recipientsWithEmailCount <= 0) {
      throw new Error("The selected donor segment does not have any captured email addresses yet.")
    }

    const deliveryStatus = input.deliveryMode === "send" ? "sent" : "queued"
    const recipientName = `${input.selectedSegment.label} (${input.selectedSegment.recipientsWithEmailCount}/${input.selectedSegment.recipientCount} emails)`

    return new EmailLog({
      id: `manual-audience-${input.deliveryMode}-${Date.now()}`,
      ruleKey: "manual_update",
      recipientType: "donor",
      recipientName,
      subject: input.draft.subject,
      status: deliveryStatus,
      sentAt: new Date().toISOString(),
      campaignId: input.campaign.id,
      campaignTitle: input.campaign.title,
    }).toSummary()
  }

  createGenerationRequest(input: GenerateAiDraftInput): EmailGenerationRequest {
    const recipientCount = input.selectedSegment?.recipientCount ?? 0
    const recipientsWithEmailCount = input.selectedSegment?.recipientsWithEmailCount ?? 0

    return new EmailGenerationRequest({
      campaignId: input.campaign?.id,
      campaignTitle: input.campaign?.title || "",
      campaignSummary: input.campaign?.summary,
      targetAmount: input.campaign?.targetAmount,
      raisedAmount: input.campaign?.raisedAmount,
      donorCount: input.campaign?.donorCount,
      segmentKey: input.selectedSegment?.key || "recent",
      recipientCount,
      recipientsWithEmailCount,
      purpose: input.purpose,
      tone: input.tone,
      variationIndex: input.variationIndex,
      additionalPrompt: input.additionalPrompt,
      customPurposeText: input.customPurposeText,
    })
  }

  async generateAiDraft(input: GenerateAiDraftInput): Promise<EmailDraftSummary> {
    const request = this.createGenerationRequest(input)
    const validationError = request.validate()

    if (validationError) {
      throw new Error(validationError)
    }

    const response = await fetch("/api/ai/email-draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.toPayload()),
    })

    const data = (await response.json().catch(() => null)) as { draft?: EmailDraftSummary; error?: string } | null

    if (!response.ok || !data?.draft) {
      throw new Error(data?.error || "Unable to generate an AI email draft right now.")
    }

    return data.draft
  }

  getSavedDrafts(fundRaiserUserId: string): EmailDraftSummary[] {
    if (typeof window === "undefined") {
      return []
    }

    try {
      const stored = window.localStorage.getItem(this.getSavedDraftStorageKey(fundRaiserUserId))
      if (!stored) return []
      const parsed = JSON.parse(stored) as EmailDraftSummary[]
      return Array.isArray(parsed)
        ? parsed.sort((a, b) => new Date(b.savedAt || b.generatedAt).getTime() - new Date(a.savedAt || a.generatedAt).getTime())
        : []
    } catch {
      return []
    }
  }

  saveDraft(fundRaiserUserId: string, draft: EmailDraftSummary): EmailDraftSummary[] {
    if (typeof window === "undefined") {
      return [draft]
    }

    const savedAt = new Date().toISOString()
    const nextDraft = new EmailDraft({
      id: draft.id,
      campaignId: draft.campaignId,
      campaignTitle: draft.campaignTitle,
      segmentKey: draft.segmentKey,
      purpose: draft.purpose,
      tone: draft.tone,
      subject: draft.subject,
      body: draft.body,
      variationLabel: draft.variationLabel,
      generatedAt: draft.generatedAt,
      savedAt,
      modelName: draft.modelName,
    }).toSummary(draft.segmentLabel)

    const existingDrafts = this.getSavedDrafts(fundRaiserUserId)
    const nextDrafts = [nextDraft, ...existingDrafts.filter((item) => item.id !== nextDraft.id)]
    window.localStorage.setItem(this.getSavedDraftStorageKey(fundRaiserUserId), JSON.stringify(nextDrafts))
    return nextDrafts
  }

  deleteSavedDraft(fundRaiserUserId: string, draftId: string): EmailDraftSummary[] {
    if (typeof window === "undefined") {
      return []
    }

    const nextDrafts = this.getSavedDrafts(fundRaiserUserId).filter((draft) => draft.id !== draftId)
    window.localStorage.setItem(this.getSavedDraftStorageKey(fundRaiserUserId), JSON.stringify(nextDrafts))
    return nextDrafts
  }

  private getSavedDraftStorageKey(fundRaiserUserId: string): string {
    return `${this.savedDraftStoragePrefix}:${fundRaiserUserId}`
  }

  private buildSegmentOptions(
    fundRaiserCampaigns: Campaign[],
    selectedCampaignId?: string
  ): EmailSegmentOption[] {
    const segmentKeys: DonorSegmentKey[] = ["high_value", "repeat", "recent", "anonymous"]

    return segmentKeys.map((segmentKey) => {
      const audience = this.buildSelectedSegment(fundRaiserCampaigns, segmentKey, selectedCampaignId)

      return {
        key: segmentKey,
        label: getDonorSegmentLabel(segmentKey),
        description: getDonorSegmentDescription(segmentKey),
        recipientCount: audience?.recipientCount ?? 0,
        recipientsWithEmailCount: audience?.recipientsWithEmailCount ?? 0,
      }
    })
  }

  private buildWorkflowAudiencePreview(
    ruleKey: EmailAutomationRuleSummary["key"],
    fundRaiserCampaigns: Campaign[],
    selectedCampaignId?: string,
    fundRaiserUser?: User
  ): WorkflowAudiencePreview {
    if (ruleKey === "new_donation_alert") {
      const resolvedFundRaiserUser = fundRaiserUser ?? this.users.find((user) => user.id === fundRaiserCampaigns[0]?.organiser.id)
      return {
        label: resolvedFundRaiserUser?.displayName || "Fund raiser",
        description: "This workflow sends a new donation alert to the logged-in fund raiser account.",
        recipientType: "fund_raiser",
        recipientCount: resolvedFundRaiserUser ? 1 : 0,
        recipientsWithEmailCount: resolvedFundRaiserUser?.email ? 1 : 0,
      }
    }

    if (ruleKey === "thank_you") {
      const recentAudience = this.buildSelectedSegment(fundRaiserCampaigns, "recent", selectedCampaignId)
      return {
        label: recentAudience?.label || "Recent supporters",
        description: "Recipients are the recent supporters tied to the selected campaign context.",
        recipientType: "donor",
        recipientCount: recentAudience?.recipientCount ?? 0,
        recipientsWithEmailCount: recentAudience?.recipientsWithEmailCount ?? 0,
      }
    }

    const allSupporters = this.buildAllSupportersAudience(fundRaiserCampaigns, selectedCampaignId)
    return {
      label: allSupporters.label,
      description:
        ruleKey === "milestone"
          ? "Recipients are all supporters for the selected campaign when a milestone is reached."
          : "Recipients are all supporters for the selected campaign when an update is sent.",
      recipientType: "donor",
      recipientCount: allSupporters.recipientCount,
      recipientsWithEmailCount: allSupporters.recipientsWithEmailCount,
    }
  }

  private buildWorkflowTriggerSummary(
    ruleKey: EmailAutomationRuleSummary["key"],
    fundRaiserCampaigns: Campaign[],
    selectedCampaignId: string | undefined,
    logs: EmailLogSummary[] = [],
    fundRaiserUser?: User
  ): EmailWorkflowTriggerSummary {
    const campaign = selectedCampaignId
      ? fundRaiserCampaigns.find((item) => item.id === selectedCampaignId)
      : fundRaiserCampaigns[0]
    const audiencePreview = this.buildWorkflowAudiencePreview(ruleKey, fundRaiserCampaigns, selectedCampaignId, fundRaiserUser)

    if (!campaign) {
      return new EmailWorkflowTrigger({
        ruleKey,
        triggeredWhen: "Choose a campaign to evaluate this workflow.",
        status: "inactive",
        statusReason: "No campaign is selected yet, so this trigger cannot be evaluated.",
        recipientCount: audiencePreview.recipientCount,
        recipientsWithEmailCount: audiencePreview.recipientsWithEmailCount,
      }).toSummary()
    }

    if (ruleKey === "manual_update") {
      const latestUpdate = this.getLatestCampaignUpdate(campaign)
      const latestSent = this.getLatestSentLogTimestamp(logs, "manual_update", campaign?.id)
      const ready = Boolean(latestUpdate && (!latestSent || new Date(latestUpdate.createdAt).getTime() > latestSent))

      return new EmailWorkflowTrigger({
        ruleKey,
        triggeredWhen: "When a new public campaign update is posted.",
        status: ready ? "armed" : latestUpdate ? "watching" : "inactive",
        statusReason: ready
          ? `The latest update "${latestUpdate?.title}" has not been emailed to supporters yet.`
          : latestUpdate
            ? "No newer campaign update has been posted since the last donor update email."
            : "This campaign does not have any public updates yet.",
        recipientCount: audiencePreview.recipientCount,
        recipientsWithEmailCount: audiencePreview.recipientsWithEmailCount,
        eventLabel: latestUpdate?.title,
        eventAt: latestUpdate?.createdAt,
      }).toSummary()
    }

    if (ruleKey === "thank_you") {
      const latestDonation = this.getLatestCompletedDonation(campaign?.id)
      const latestSent = this.getLatestSentLogTimestamp(logs, "thank_you", campaign?.id)
      const ready = Boolean(latestDonation && (!latestSent || new Date(latestDonation.createdAt).getTime() > latestSent))

      return new EmailWorkflowTrigger({
        ruleKey,
        triggeredWhen: "Immediately after a completed donation is received.",
        status: ready ? "armed" : latestDonation ? "watching" : "inactive",
        statusReason: ready
          ? `A completed donation from ${latestDonation?.isAnonymous ? "an anonymous supporter" : latestDonation?.donorName} is waiting for a thank-you email.`
          : latestDonation
            ? "No newer completed donation has arrived since the last thank-you email."
            : "No completed donations have been recorded for this campaign yet.",
        recipientCount: audiencePreview.recipientCount,
        recipientsWithEmailCount: audiencePreview.recipientsWithEmailCount,
        eventLabel: latestDonation
          ? `${latestDonation.isAnonymous ? "Anonymous supporter" : latestDonation.donorName} donated $${latestDonation.amount.toLocaleString()}`
          : undefined,
        eventAt: latestDonation?.createdAt,
      }).toSummary()
    }

    if (ruleKey === "milestone") {
      const progressPercent = campaign && campaign.targetAmount > 0 ? (campaign.raisedAmount / campaign.targetAmount) * 100 : 0
      const achievedMilestones = this.milestoneThresholds.filter((threshold) => progressPercent >= threshold)
      const sentMilestones = logs.filter(
        (log) => log.ruleKey === "milestone" && log.campaignId === campaign?.id && log.status === "sent"
      ).length
      const latestAchieved = achievedMilestones[achievedMilestones.length - 1]
      const ready = achievedMilestones.length > sentMilestones && achievedMilestones.length > 0

      return new EmailWorkflowTrigger({
        ruleKey,
        triggeredWhen: "When the campaign crosses 25%, 50%, 75%, or 100% of its goal.",
        status: ready ? "armed" : campaign ? "watching" : "inactive",
        statusReason: ready
          ? `${latestAchieved}% of goal has been reached and the matching milestone email has not been sent yet.`
          : achievedMilestones.length > 0
            ? "All currently reached milestones already have a sent email recorded."
            : "This campaign has not crossed a milestone threshold yet.",
        recipientCount: audiencePreview.recipientCount,
        recipientsWithEmailCount: audiencePreview.recipientsWithEmailCount,
        eventLabel: campaign ? `${Math.round(progressPercent)}% funded` : undefined,
        eventAt: campaign?.createdAt,
        thresholdLabel: latestAchieved ? `${latestAchieved}%` : undefined,
      }).toSummary()
    }

    const latestDonation = this.getLatestCompletedDonation(campaign?.id)
    const latestSent = this.getLatestSentLogTimestamp(logs, "new_donation_alert", campaign?.id)
    const ready = Boolean(latestDonation && (!latestSent || new Date(latestDonation.createdAt).getTime() > latestSent))

    return new EmailWorkflowTrigger({
      ruleKey,
      triggeredWhen: "When a donor completes a donation.",
      status: ready ? "armed" : campaign ? "watching" : "inactive",
      statusReason: ready
        ? "A completed donation was received and the fund raiser alert has not been sent yet."
        : latestDonation
          ? "The latest completed donation already has a sent fund raiser alert recorded."
          : "No completed donations have been recorded for this campaign yet.",
      recipientCount: audiencePreview.recipientCount,
      recipientsWithEmailCount: audiencePreview.recipientsWithEmailCount,
      eventLabel: latestDonation ? `${latestDonation.donorName} donated` : undefined,
      eventAt: latestDonation?.createdAt,
    }).toSummary()
  }

  private getLatestCampaignUpdate(campaign?: Campaign): CampaignUpdate | undefined {
    if (!campaign?.updates?.length) return undefined
    return [...campaign.updates].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  }

  private getLatestCompletedDonation(campaignId?: string): Donation | undefined {
    const relevant = this.donations.filter(
      (donation) => donation.status === "completed" && donation.campaignId === campaignId
    )
    if (!relevant.length) return undefined
    return [...relevant].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  }

  private getLatestSupporterActivityTimestamp(campaign?: Campaign): number | undefined {
    if (!campaign) return undefined
    const latestDonation = this.getLatestCompletedDonation(campaign.id)
    const latestUpdate = this.getLatestCampaignUpdate(campaign)
    const candidates = [latestDonation?.createdAt, latestUpdate?.createdAt].filter(Boolean) as string[]
    if (!candidates.length) return undefined
    return Math.max(...candidates.map((value) => new Date(value).getTime()))
  }

  private getLatestSentLogTimestamp(
    logs: EmailLogSummary[],
    ruleKey: EmailAutomationRuleSummary["key"],
    campaignId?: string
  ): number | undefined {
    const relevant = logs.filter(
      (log) => log.ruleKey === ruleKey && log.campaignId === campaignId && log.status === "sent"
    )
    if (!relevant.length) return undefined
    return Math.max(...relevant.map((log) => new Date(log.sentAt).getTime()))
  }

  private buildAllSupportersAudience(
    fundRaiserCampaigns: Campaign[],
    selectedCampaignId?: string
  ): { label: string; recipientCount: number; recipientsWithEmailCount: number } {
    const campaignIds = new Set(
      (selectedCampaignId
        ? fundRaiserCampaigns.filter((campaign) => campaign.id === selectedCampaignId)
        : fundRaiserCampaigns
      ).map((campaign) => campaign.id)
    )

    const relevantDonations = this.donations.filter(
      (donation) => donation.status === "completed" && campaignIds.has(donation.campaignId)
    )

    const recentCutoffTimestamp = this.getRecentCutoffTimestamp(relevantDonations)
    const donors = this.buildDonorSummaries(relevantDonations, recentCutoffTimestamp)

    return {
      label: "All supporters",
      recipientCount: donors.length,
      recipientsWithEmailCount: donors.filter((donor) => Boolean(donor.donorEmail)).length,
    }
  }

  private buildSelectedSegment(
    fundRaiserCampaigns: Campaign[],
    segmentValue?: string,
    selectedCampaignId?: string
  ): EmailSegmentAudienceSummary | undefined {
    if (!isDonorSegmentKey(segmentValue)) {
      return undefined
    }

    const campaignIds = new Set(
      (selectedCampaignId
        ? fundRaiserCampaigns.filter((campaign) => campaign.id === selectedCampaignId)
        : fundRaiserCampaigns
      ).map((campaign) => campaign.id)
    )

    const relevantDonations = this.donations.filter(
      (donation) => donation.status === "completed" && campaignIds.has(donation.campaignId)
    )

    const recentCutoffTimestamp = this.getRecentCutoffTimestamp(relevantDonations)
    const donors = this.buildDonorSummaries(relevantDonations, recentCutoffTimestamp)
      .filter((donor) => this.matchesSegment(donor, segmentValue, recentCutoffTimestamp))
      .sort((a, b) => b.totalDonated - a.totalDonated)

    return {
      key: segmentValue,
      label: getDonorSegmentLabel(segmentValue),
      description: getDonorSegmentDescription(segmentValue),
      recipientCount: donors.length,
      recipientsWithEmailCount: donors.filter((donor) => Boolean(donor.donorEmail)).length,
      recipients: donors.slice(0, 5).map((donor) => ({
        donorId: donor.donorId,
        donorName: donor.donorName,
        donorEmail: donor.donorEmail,
        totalDonated: donor.totalDonated,
        donationCount: donor.donationCount,
      })),
    }
  }

  private buildDonorSummaries(relevantDonations: Donation[], recentCutoffTimestamp: number): DonorSummary[] {
    const donorsById = new Map<string, Donor>()

    for (const donation of relevantDonations) {
      const donorUser = this.users.find((user) => user.id === donation.donorId)
      const donor =
        donorsById.get(donation.donorId) ??
        new Donor({
          donorId: donation.donorId,
          donorName: donorUser?.displayName || donation.donorName || "Unknown donor",
          donorEmail: donorUser?.email,
          donorAvatar: donorUser?.avatar,
        })

      donor.addDonation(donation)
      donorsById.set(donation.donorId, donor)
    }

    return Array.from(donorsById.values()).map((donor) => donor.toSummary(recentCutoffTimestamp))
  }

  private matchesSegment(donor: DonorSummary, segment: DonorSegmentKey, recentCutoffTimestamp: number): boolean {
    switch (segment) {
      case "high_value":
        return donor.totalDonated >= 1000
      case "repeat":
        return donor.donationCount >= 2
      case "recent":
        return new Date(donor.lastDonationAt).getTime() >= recentCutoffTimestamp
      case "anonymous":
        return donor.anonymousDonationCount > 0
      default:
        return false
    }
  }

  private getWorkflowRecipientEmails(
    ruleKey: EmailAutomationRuleSummary["key"],
    campaign: Campaign | undefined,
    fundRaiserUser: User
  ): string[] {
    if (ruleKey === "new_donation_alert") {
      return fundRaiserUser.email ? [fundRaiserUser.email] : []
    }

    if (!campaign) {
      return []
    }

    if (ruleKey === "thank_you") {
      return this.getSegmentRecipientEmails([campaign], "recent", campaign.id)
    }

    return this.getAllSupporterRecipientEmails([campaign], campaign.id)
  }

  private getSegmentRecipientEmails(
    fundRaiserCampaigns: Campaign[],
    segmentValue: DonorSegmentKey,
    selectedCampaignId?: string
  ): string[] {
    const donors = this.getSegmentDonorSummaries(fundRaiserCampaigns, segmentValue, selectedCampaignId)
    return Array.from(new Set(donors.map((donor) => donor.donorEmail).filter((email): email is string => Boolean(email))))
  }

  private getAllSupporterRecipientEmails(fundRaiserCampaigns: Campaign[], selectedCampaignId?: string): string[] {
    const campaignIds = new Set(
      (selectedCampaignId
        ? fundRaiserCampaigns.filter((campaign) => campaign.id === selectedCampaignId)
        : fundRaiserCampaigns
      ).map((campaign) => campaign.id)
    )

    const relevantDonations = this.donations.filter(
      (donation) => donation.status === "completed" && campaignIds.has(donation.campaignId)
    )

    const recentCutoffTimestamp = this.getRecentCutoffTimestamp(relevantDonations)
    const donors = this.buildDonorSummaries(relevantDonations, recentCutoffTimestamp)
    return Array.from(new Set(donors.map((donor) => donor.donorEmail).filter((email): email is string => Boolean(email))))
  }

  private getSegmentDonorSummaries(
    fundRaiserCampaigns: Campaign[],
    segmentValue: DonorSegmentKey,
    selectedCampaignId?: string
  ): DonorSummary[] {
    const campaignIds = new Set(
      (selectedCampaignId
        ? fundRaiserCampaigns.filter((campaign) => campaign.id === selectedCampaignId)
        : fundRaiserCampaigns
      ).map((campaign) => campaign.id)
    )

    const relevantDonations = this.donations.filter(
      (donation) => donation.status === "completed" && campaignIds.has(donation.campaignId)
    )

    const recentCutoffTimestamp = this.getRecentCutoffTimestamp(relevantDonations)
    return this.buildDonorSummaries(relevantDonations, recentCutoffTimestamp)
      .filter((donor) => this.matchesSegment(donor, segmentValue, recentCutoffTimestamp))
      .sort((a, b) => b.totalDonated - a.totalDonated)
  }

  private async sendEmailRequest(payload: SendEmailRoutePayload): Promise<number> {
    const hasDirectRecipients = payload.to.length > 0
    const usingConfiguredSender = payload.useConfiguredSenderAsRecipient === true

    if (!hasDirectRecipients && !usingConfiguredSender) {
      throw new Error("There are no recipient email addresses available for this action.")
    }

    const response = await fetch("/api/emails/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = (await response.json().catch(() => null)) as
      | { deliveredCount?: number; error?: string }
      | null

    if (!response.ok) {
      throw new Error(data?.error || "Unable to send the email right now.")
    }

    if (typeof data?.deliveredCount === "number") {
      return data.deliveredCount
    }

    return usingConfiguredSender ? 1 : payload.to.length
  }

  private buildStats(logs: EmailLogSummary[], rules: EmailAutomationRuleSummary[]): EmailAutomationStats {
    return {
      emailsSent: logs.filter((log) => log.status === "sent").length,
      donorEmailsSent: logs.filter((log) => log.recipientType === "donor" && log.status === "sent").length,
      fundRaiserEmailsSent: logs.filter((log) => log.recipientType === "fund_raiser" && log.status === "sent").length,
      activeRules: rules.filter((rule) => rule.isEnabled).length,
    }
  }

  private buildTemplateReplacements(
    fundRaiserUser: User,
    campaign?: Campaign,
    selectedSegment?: EmailSegmentAudienceSummary,
    fallbackRecipientLabel?: string
  ): Record<string, string | number | undefined> {
    const milestonePercent =
      campaign && campaign.targetAmount > 0
        ? Math.round((campaign.raisedAmount / campaign.targetAmount) * 100)
        : undefined

    return {
      campaignTitle: campaign?.title,
      targetAmount: campaign?.targetAmount?.toLocaleString(),
      raisedAmount: campaign?.raisedAmount?.toLocaleString(),
      donorCount: campaign?.donorCount,
      recipientLabel: selectedSegment?.label || fallbackRecipientLabel || "supporters",
      milestonePercent,
      fundRaiserName: fundRaiserUser.displayName,
    }
  }

  private getRecentCutoffTimestamp(relevantDonations: Donation[]): number {
    if (relevantDonations.length === 0) {
      return Date.now() - 1000 * 60 * 60 * 24 * 30
    }

    const latestTimestamp = Math.max(...relevantDonations.map((donation) => new Date(donation.createdAt).getTime()))
    return latestTimestamp - 1000 * 60 * 60 * 24 * 30
  }
}
