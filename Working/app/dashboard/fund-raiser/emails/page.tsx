"use client"

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  Mail,
  MessageSquareHeart,
  PencilLine,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
  WandSparkles,
  X,
} from "lucide-react"
import { DashboardLayout } from "@/components/layout/dashboard-sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { StatsCard } from "@/components/ui/stats-card"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { EmailAutomationController } from "@/app/controller/EmailAutomationController"
import { isDonorSegmentKey, type DonorSegmentKey } from "@/app/entity/Donor"
import { getEmailDraftToneLabel, type EmailDraftPurpose, type EmailDraftSummary, type EmailDraftTone } from "@/app/entity/EmailDraft"
import type { EmailTriggerKey, EmailAutomationRuleSummary } from "@/app/entity/EmailAutomationRule"
import type { EmailLogSummary } from "@/app/entity/EmailLog"
import type { EmailTemplateSummary } from "@/app/entity/EmailTemplate"
import type { Campaign, Donation, User } from "@/lib/types"

type EmailLogsMeta = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  status: string
  sort: "newest" | "oldest"
  campaignId: string
}

type FundRaiserEmailsResponse = {
  currentUser: User
  campaigns: Campaign[]
  donations: Donation[]
  users: User[]
  rules: EmailAutomationRuleSummary[]
  templates: EmailTemplateSummary[]
  logs: EmailLogSummary[]
  logsMeta?: EmailLogsMeta
}

type GroupedEmailActivity = {
  id: string
  ruleKey: EmailLogSummary["ruleKey"]
  ruleLabel: string
  status: EmailLogSummary["status"]
  statusLabel: string
  subject: string
  campaignId?: string
  campaignTitle?: string
  sentAt: string
  recipientCount: number
  recipients: Array<{ name: string; email?: string }>
}


const defaultEmailAutomationController = new EmailAutomationController([], [], [])
const fallbackFundRaiserUser: User = {
  id: "pending-fundraiser-user",
  email: "fundraiser@example.com",
  displayName: "Fund Raiser",
  firstName: "Fund",
  lastName: "Raiser",
  role: "fund_raiser",
  isVerified: true,
  status: "active",
  createdAt: new Date(0).toISOString(),
}
const toneOptions: EmailDraftTone[] = ["warm", "appreciative", "professional", "urgent"]
const emailPurposeOptions: Array<{ value: EmailDraftPurpose; label: string }> = [
  { value: "campaign_update", label: "Campaign update" },
  { value: "thank_you", label: "Thank-you" },
  { value: "milestone_update", label: "Milestone update" },
  { value: "re_engagement", label: "Re-engagement" },
  { value: "custom", label: "Custom purpose" },
]
const workflowOrder: EmailTriggerKey[] = ["manual_update", "thank_you", "milestone", "new_donation_alert"]
const ACTIVITY_PAGE_SIZE = 10
const ACTIVITY_FETCH_SIZE = 200

function formatDateTime(value?: string) {
  if (!value) return "No event timestamp"
  return new Date(value).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function normaliseEmail(value?: string | null) {
  return value?.trim().toLowerCase() || ""
}

function isEmailLike(value?: string | null) {
  return Boolean(value && value.includes("@"))
}

function getUserDisplayName(user: User) {
  return user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
}

function buildRecipientNameLookup(donations: Donation[], users: User[]) {
  const lookup = new Map<string, string>()

  users.forEach((user) => {
    const email = normaliseEmail(user.email)
    const name = getUserDisplayName(user).trim()

    if (email && name && !isEmailLike(name)) {
      lookup.set(email, name)
    }
  })

  donations.forEach((donation) => {
    const donorEmail = normaliseEmail(donation.donorEmail)
    const donorName = donation.donorName?.trim()

    if (donorEmail && donorName && !isEmailLike(donorName)) {
      lookup.set(donorEmail, donorName)
    }
  })

  return lookup
}

function resolveRecipientName(
  recipientName: string | undefined,
  recipientEmail: string | undefined,
  recipientNameLookup: Map<string, string>
) {
  const trimmedName = recipientName?.trim()
  const trimmedEmail = recipientEmail?.trim()
  const emailKey = normaliseEmail(trimmedEmail)

  if (trimmedName && !isEmailLike(trimmedName) && trimmedName !== trimmedEmail) {
    return trimmedName
  }

  if (emailKey && recipientNameLookup.has(emailKey)) {
    return recipientNameLookup.get(emailKey) || trimmedEmail || "Unnamed recipient"
  }

  return trimmedEmail || trimmedName || "Unnamed recipient"
}

function groupEmailActivity(
  logs: EmailLogSummary[],
  recipientNameLookup: Map<string, string>
): GroupedEmailActivity[] {
  const grouped = new Map<string, GroupedEmailActivity>()

  for (const log of logs) {
    const sentAtBucket = log.sentAt ? new Date(Math.floor(new Date(log.sentAt).getTime() / 1000) * 1000).toISOString() : "no-date"
    const groupKey = [
      log.ruleKey,
      log.status,
      log.subject,
      log.campaignId || log.campaignTitle || "no-campaign",
      sentAtBucket,
    ].join("::")

    const existing = grouped.get(groupKey)
    if (existing) {
      existing.recipientCount += 1
      existing.recipients.push({
        name: resolveRecipientName(log.recipientName, log.recipientEmail, recipientNameLookup),
        email: log.recipientEmail,
      })
      continue
    }

    grouped.set(groupKey, {
      id: groupKey,
      ruleKey: log.ruleKey,
      ruleLabel: log.ruleLabel,
      status: log.status,
      statusLabel: log.statusLabel,
      subject: log.subject,
      campaignId: log.campaignId,
      campaignTitle: log.campaignTitle,
      sentAt: log.sentAt,
      recipientCount: 1,
      recipients: [
        {
          name: resolveRecipientName(log.recipientName, log.recipientEmail, recipientNameLookup),
          email: log.recipientEmail,
        },
      ],
    })
  }

  return Array.from(grouped.values())
}

function FundRaiserEmailsPageContent() {
  const searchParams = useSearchParams()
  const initialSegment = searchParams.get("segment")
  const initialCampaignId = searchParams.get("campaignId") || ""
  const [activeSection, setActiveSection] = useState<"automatic" | "manual">("automatic")
  const [campaignsData, setCampaignsData] = useState<Campaign[]>([])
  const [donationsData, setDonationsData] = useState<Donation[]>([])
  const [directoryUsers, setDirectoryUsers] = useState<User[]>([])
  const [currentFundRaiserUser, setCurrentFundRaiserUser] = useState<User | null>(null)
  const [rules, setRules] = useState<EmailAutomationRuleSummary[]>(() => defaultEmailAutomationController.createDefaultRules())
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>(() => defaultEmailAutomationController.createDefaultTemplates())
  const [activityLogs, setActivityLogs] = useState<EmailLogSummary[]>([])
  const [isLoadingEmailData, setIsLoadingEmailData] = useState(true)
  const [emailDataError, setEmailDataError] = useState("")
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaignId)
  const [selectedSegmentKey, setSelectedSegmentKey] = useState<DonorSegmentKey>(
    isDonorSegmentKey(initialSegment) ? initialSegment : "high_value"
  )
  const [selectedWorkflowKey, setSelectedWorkflowKey] = useState<EmailTriggerKey>("manual_update")
  const [templateSubject, setTemplateSubject] = useState("")
  const [templateBody, setTemplateBody] = useState("")
  const [manualPurpose, setManualPurpose] = useState<EmailDraftPurpose>("campaign_update")
  const [customPurposeText, setCustomPurposeText] = useState("")
  const [manualTone, setManualTone] = useState<EmailDraftTone>("warm")
  const [additionalPrompt, setAdditionalPrompt] = useState("")
  const [generatedDraft, setGeneratedDraft] = useState<EmailDraftSummary | null>(null)
  const [savedDrafts, setSavedDrafts] = useState<EmailDraftSummary[]>([])
  const [variationIndex, setVariationIndex] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [manualAiStatus, setManualAiStatus] = useState<{ type: "idle" | "error" | "success"; message: string }>({
    type: "idle",
    message: "",
  })
  const [manualDeliveryStatus, setManualDeliveryStatus] = useState<{
    type: "idle" | "sending" | "success" | "error"
    message: string
  }>({
    type: "idle",
    message: "",
  })

  const [activityStatusFilter, setActivityStatusFilter] = useState<"all" | EmailLogSummary["status"]>("all")
  const [activityCampaignFilter, setActivityCampaignFilter] = useState<string>("all")
  const [activityCampaignSearch, setActivityCampaignSearch] = useState("")
  const [activitySortOrder, setActivitySortOrder] = useState<"newest" | "oldest">("newest")
  const [activityPage, setActivityPage] = useState(1)
  const [activityMeta, setActivityMeta] = useState<EmailLogsMeta>({
    page: 1,
    pageSize: ACTIVITY_PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
    status: "all",
    sort: "newest",
    campaignId: "all",
  })
  const [isRefreshingActivity, setIsRefreshingActivity] = useState(false)
  const [expandedActivityRows, setExpandedActivityRows] = useState<string[]>([])
  const hasLoadedEmailDataRef = useRef(false)

  const [templateSaveState, setTemplateSaveState] = useState<{
    type: "idle" | "dirty" | "saving" | "saved" | "error"
    message: string
  }>({
    type: "idle",
    message: "",
  })

  const [workflowActionState, setWorkflowActionState] = useState<{
    type: "idle" | "success" | "error"
    message: string
  }>({
    type: "idle",
    message: "",
  })

  const emailAutomationController = useMemo(
    () => new EmailAutomationController(campaignsData, donationsData, directoryUsers),
    [campaignsData, donationsData, directoryUsers]
  )

  const resolvedFundRaiserUser = currentFundRaiserUser || fallbackFundRaiserUser

  const refreshEmailsDashboard = useCallback(
    async (options?: { page?: number; activityOnly?: boolean; showToast?: boolean }) => {
      const activityOnly = options?.activityOnly ?? hasLoadedEmailDataRef.current
      const params = new URLSearchParams({
        logsPage: "1",
        logsPageSize: String(ACTIVITY_FETCH_SIZE),
        logsStatus: activityStatusFilter,
        logsSort: activitySortOrder,
        logsCampaignId: activityCampaignFilter,
      })

      if (activityOnly) {
        setIsRefreshingActivity(true)
      } else {
        setIsLoadingEmailData(true)
      }
      setEmailDataError("")

      try {
        const response = await fetch(`/api/fund-raiser/emails?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        })

        const data = (await response.json().catch(() => null)) as
          | FundRaiserEmailsResponse
          | { error?: string }
          | null

        if (!response.ok || !data || !("currentUser" in data)) {
          throw new Error((data && "error" in data && data.error) || "Unable to load email workflows right now.")
        }

        const nextLogsMeta: EmailLogsMeta = data.logsMeta || {
          page: 1,
          pageSize: ACTIVITY_FETCH_SIZE,
          totalCount: Array.isArray(data.logs) ? data.logs.length : 0,
          totalPages: 1,
          status: activityStatusFilter,
          sort: activitySortOrder,
          campaignId: activityCampaignFilter,
        }

        setCurrentFundRaiserUser(data.currentUser)
        setCampaignsData(Array.isArray(data.campaigns) ? data.campaigns : [])
        setDonationsData(Array.isArray(data.donations) ? data.donations : [])
        setDirectoryUsers(Array.isArray(data.users) ? data.users : [])
        setRules(Array.isArray(data.rules) && data.rules.length > 0 ? data.rules : defaultEmailAutomationController.createDefaultRules())
        setTemplates(Array.isArray(data.templates) && data.templates.length > 0 ? data.templates : defaultEmailAutomationController.createDefaultTemplates())
        setActivityLogs(Array.isArray(data.logs) ? data.logs : [])
        setActivityMeta(nextLogsMeta)
        hasLoadedEmailDataRef.current = true

        if (options?.showToast) {
          toast({
            title: "Email activity refreshed",
            description: "The latest workflow email activity has been loaded.",
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load email workflows right now."
        if (!activityOnly) {
          setEmailDataError(message)
        }
        toast({
          title: activityOnly ? "Unable to refresh email activity" : "Unable to load email automation",
          description: message,
          variant: "destructive",
        })
      } finally {
        if (activityOnly) {
          setIsRefreshingActivity(false)
        } else {
          setIsLoadingEmailData(false)
        }
      }
    },
    [activityCampaignFilter, activitySortOrder, activityStatusFilter]
  )

  const persistWorkflowChange = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/fund-raiser/emails", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = (await response.json().catch(() => null)) as
      | Partial<FundRaiserEmailsResponse>
      | { error?: string }
      | null

    if (!response.ok) {
      throw new Error((data && "error" in data && data.error) || "Unable to save workflow changes right now.")
    }

    if (data && "rules" in data && Array.isArray(data.rules) && data.rules.length > 0) {
      setRules(data.rules as EmailAutomationRuleSummary[])
    }

    if (data && "templates" in data && Array.isArray(data.templates) && data.templates.length > 0) {
      setTemplates(data.templates as EmailTemplateSummary[])
    }

    return data
  }, [])

  useEffect(() => {
    refreshEmailsDashboard()
  }, [refreshEmailsDashboard])

  const dashboard = useMemo(
    () =>
      emailAutomationController.buildDashboard(resolvedFundRaiserUser.id, rules, templates, activityLogs, {
        segment: selectedSegmentKey,
        campaignId: selectedCampaignId,
      }),
    [emailAutomationController, resolvedFundRaiserUser.id, rules, templates, activityLogs, selectedSegmentKey, selectedCampaignId]
  )

  const selectedCampaign =
    dashboard.fundRaiserCampaigns.find((campaign) => campaign.id === selectedCampaignId) ||
    dashboard.fundRaiserCampaigns[0]

  const selectedWorkflow =
    dashboard.workflowItems.find((item) => item.rule.key === selectedWorkflowKey) ||
    dashboard.workflowItems[0]

  const selectedSegment = dashboard.selectedSegment
  const automaticAudience = selectedWorkflow?.audiencePreview
  const selectedTrigger = selectedWorkflow?.triggerSummary
  const isFundRaiserAlertWorkflow = selectedWorkflow?.rule.key === "new_donation_alert"

  useEffect(() => {
    const hasSelectedCampaign = dashboard.fundRaiserCampaigns.some((campaign) => campaign.id === selectedCampaignId)
    if ((!selectedCampaignId || !hasSelectedCampaign) && dashboard.suggestedCampaignId) {
      setSelectedCampaignId(dashboard.suggestedCampaignId)
    }
  }, [selectedCampaignId, dashboard.suggestedCampaignId, dashboard.fundRaiserCampaigns])

  useEffect(() => {
    if (selectedWorkflow?.template) {
      setTemplateSubject(selectedWorkflow.template.subjectTemplate)
      setTemplateBody(selectedWorkflow.template.bodyTemplate)
    }
    setTemplateSaveState({ type: "idle", message: "" })
    setWorkflowActionState({ type: "idle", message: "" })
  }, [selectedWorkflow?.template?.ruleKey, selectedWorkflow?.template?.subjectTemplate, selectedWorkflow?.template?.bodyTemplate])

  useEffect(() => {
    if (!selectedWorkflow?.template) {
      return
    }

    const hasChanges =
      templateSubject !== selectedWorkflow.template.subjectTemplate ||
      templateBody !== selectedWorkflow.template.bodyTemplate

    if (hasChanges) {
      setTemplateSaveState({
        type: "dirty",
        message: "You have unsaved template changes.",
      })
      return
    }

    setTemplateSaveState((current) => {
      if (current.type === "saving" || current.type === "saved" || current.type === "error") {
        return current
      }

      return { type: "idle", message: "" }
    })
  }, [
    selectedWorkflow?.template,
    templateSubject,
    templateBody,
  ])

  useEffect(() => {
    setSavedDrafts(emailAutomationController.getSavedDrafts(resolvedFundRaiserUser.id))
  }, [emailAutomationController, resolvedFundRaiserUser.id])

  const handleToggleRule = async (ruleId: string) => {
    const currentRule = rules.find((rule) => rule.id === ruleId)
    if (!currentRule) return

    const previousRules = rules
    const nextRules = emailAutomationController.toggleRule(rules, ruleId)
    const nextIsEnabled = !currentRule.isEnabled
    setRules(nextRules)

    try {
      await persistWorkflowChange({
        action: "toggle_rule",
        ruleKey: currentRule.key,
        isEnabled: nextIsEnabled,
      })

      toast({
        title: nextIsEnabled ? "Workflow turned on" : "Workflow turned off",
        description: `${currentRule.label} has been ${nextIsEnabled ? "enabled" : "disabled"}.`,
      })
    } catch (error) {
      setRules(previousRules)
      toast({
        title: "Unable to update workflow",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSaveTemplate = async () => {
    if (!selectedWorkflow?.template || !hasTemplateChanges) return

    setTemplateSaveState({
      type: "saving",
      message: "Saving template changes...",
    })

    try {
      await persistWorkflowChange({
        action: "save_template",
        ruleKey: selectedWorkflow.template.ruleKey,
        subjectTemplate: templateSubject,
        bodyTemplate: templateBody,
      })

      setTemplateSaveState({
        type: "saved",
        message: "Changes saved successfully.",
      })
      toast({ title: "Template updated", description: "The email template has been saved for this workflow." })
    } catch (error) {
      setTemplateSaveState({
        type: "error",
        message: "Unable to save template changes.",
      })
      toast({
        title: "Unable to save template",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleResetTemplate = async () => {
    if (!selectedWorkflow?.template) return

    try {
      const data = await persistWorkflowChange({
        action: "reset_template",
        ruleKey: selectedWorkflow.template.ruleKey,
      })

      const nextTemplate = Array.isArray(data?.templates)
        ? (data.templates as EmailTemplateSummary[]).find((item) => item.ruleKey === selectedWorkflow.template?.ruleKey)
        : undefined

      setTemplateSubject(nextTemplate?.subjectTemplate || "")
      setTemplateBody(nextTemplate?.bodyTemplate || "")
      setTemplateSaveState({
        type: "saved",
        message: "Template reset to default and saved.",
      })

      toast({ title: "Template reset", description: "The workflow template was reset to its default version." })
    } catch (error) {
      setTemplateSaveState({
        type: "error",
        message: "Unable to reset the template.",
      })
      toast({
        title: "Unable to reset template",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleQuickTest = async () => {
    if (!selectedWorkflow?.template) return

    try {
      setWorkflowActionState({ type: "idle", message: "" })

      const result = await emailAutomationController.sendQuickTestEmail({
        ruleKey: selectedWorkflow.rule.key,
        templateSummary: selectedWorkflow.template,
        fundRaiserUser: resolvedFundRaiserUser,
        campaign: selectedCampaign,
        selectedSegment: selectedWorkflow.rule.audience === "donor" ? selectedSegment : undefined,
      })

      setActivityLogs((current) => [result.log, ...current])
      setWorkflowActionState({
        type: "success",
        message: "Quick test sent successfully. Test email sent to the configured SMTP inbox.",
      })
      toast({ title: "Quick test sent", description: "Test email sent to the configured SMTP inbox." })
    } catch (error) {
      setWorkflowActionState({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to send quick test.",
      })
      toast({
        title: "Unable to send quick test",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }


  const handleGenerateDraft = async (regenerate = false) => {
    if (!selectedCampaign || !selectedSegment) {
      const message = "Select a campaign context and donor segment first."
      setManualAiStatus({ type: "error", message })
      toast({
        title: "Missing audience",
        description: message,
        variant: "destructive",
      })
      return
    }

    setIsGenerating(true)
    setManualAiStatus({
      type: "idle",
      message: regenerate ? "Generating another variation..." : "Generating AI draft...",
    })
    setManualDeliveryStatus({ type: "idle", message: "" })

    try {
      const nextVariation = regenerate ? variationIndex + 1 : 1
      const draft = await emailAutomationController.generateAiDraft({
        campaign: selectedCampaign,
        selectedSegment,
        purpose: manualPurpose,
        tone: manualTone,
        variationIndex: nextVariation,
        additionalPrompt,
        customPurposeText: manualPurpose === "custom" ? customPurposeText : undefined,
      })

      setVariationIndex(nextVariation)
      setGeneratedDraft(draft)
      setManualAiStatus({
        type: "success",
        message: regenerate ? "A new variation was generated." : "AI draft generated. You can edit it before sending.",
      })
      toast({
        title: regenerate ? "New variation generated" : "AI draft generated",
        description: "You can edit the subject and message before saving as a draft or sending.",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again."
      setManualAiStatus({ type: "error", message })
      toast({
        title: "Unable to generate AI draft",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveDraft = () => {
    if (!generatedDraft) {
      toast({ title: "No draft to save", description: "Generate or edit a draft first.", variant: "destructive" })
      return
    }

    const nextDrafts = emailAutomationController.saveDraft(resolvedFundRaiserUser.id, generatedDraft)
    setSavedDrafts(nextDrafts)
    toast({ title: "Draft saved", description: "The generated draft was saved for later use." })
  }

  const handleManualDelivery = async (deliveryMode: "send" | "queue") => {
    if (!generatedDraft) {
      const message = "Generate or choose a saved draft first."
      setManualDeliveryStatus({ type: "error", message })
      toast({
        title: "No draft selected",
        description: message,
        variant: "destructive",
      })
      return
    }

    if (deliveryMode === "send") {
      setManualDeliveryStatus({
        type: "sending",
        message: `Sending manual update to ${selectedSegment?.recipientsWithEmailCount ?? 0} captured email${(selectedSegment?.recipientsWithEmailCount ?? 0) === 1 ? "" : "s"}...`,
      })
    } else {
      setManualDeliveryStatus({
        type: "sending",
        message: "Queueing manual update...",
      })
    }

    try {
      const result = await emailAutomationController.deliverManualAudienceEmail({
        draft: generatedDraft,
        campaign: selectedCampaign,
        selectedSegment,
        deliveryMode,
      })

      setActivityLogs((current) => [result.log, ...current])
      setManualDeliveryStatus({
        type: "success",
        message:
          deliveryMode === "send"
            ? `Manual update sent successfully to ${result.deliveredCount} recipient${result.deliveredCount === 1 ? "" : "s"}.`
            : "Manual update queued for the selected donor segment.",
      })
      toast({
        title: deliveryMode === "send" ? "Manual update sent" : "Manual update queued",
        description:
          deliveryMode === "send"
            ? `Email sent to ${result.deliveredCount} recipient${result.deliveredCount === 1 ? "" : "s"}.`
            : "The manual update was queued for the selected donor segment.",
      })

      await refreshEmailsDashboard({ page: 1, activityOnly: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please review the selected campaign and audience."
      setManualDeliveryStatus({
        type: "error",
        message,
      })
      toast({
        title: deliveryMode === "send" ? "Unable to send manual update" : "Unable to queue manual update",
        description: message,
        variant: "destructive",
      })
    }
  }

  const handleGeneratedDraftChange = (field: "subject" | "body", value: string) => {
    setManualDeliveryStatus((current) => (current.type === "sending" ? current : { type: "idle", message: "" }))
    setGeneratedDraft((current) => {
      if (!current) return current
      return {
        ...current,
        [field]: value,
      }
    })
  }

  const handleUseSavedDraft = (draft: EmailDraftSummary) => {
    setGeneratedDraft(draft)
    setManualAiStatus({ type: "idle", message: "Saved draft loaded." })
    setManualDeliveryStatus({ type: "idle", message: "" })
    if (draft.segmentKey) {
      setSelectedSegmentKey(draft.segmentKey)
    }
    toast({ title: "Draft loaded", description: "The saved draft is now ready for editing or sending." })
  }

  const handleDeleteDraft = (draftId: string) => {
    const nextDrafts = emailAutomationController.deleteSavedDraft(resolvedFundRaiserUser.id, draftId)
    setSavedDrafts(nextDrafts)

    if (generatedDraft?.id === draftId) {
      setGeneratedDraft(null)
      setManualDeliveryStatus({ type: "idle", message: "" })
    }

    toast({ title: "Draft deleted", description: "The saved draft was removed." })
  }


  const recipientNameLookup = useMemo(
    () => buildRecipientNameLookup(donationsData, directoryUsers),
    [donationsData, directoryUsers]
  )

  const groupedActivityLogs = useMemo(
    () => groupEmailActivity(dashboard.logs, recipientNameLookup),
    [dashboard.logs, recipientNameLookup]
  )

  const activityCampaignOptions = useMemo(
    () =>
      dashboard.fundRaiserCampaigns.map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
      })),
    [dashboard.fundRaiserCampaigns]
  )

  const filteredGroupedActivityLogs = useMemo(() => {
    const campaignSearchTerm = activityCampaignSearch.trim().toLowerCase()

    const filtered = groupedActivityLogs.filter((log) => {
      const statusMatches = activityStatusFilter === "all" || log.status === activityStatusFilter
      const campaignMatches =
        activityCampaignFilter === "all" || (log.campaignId || log.campaignTitle || "unknown") === activityCampaignFilter
      const campaignSearchMatches =
        !campaignSearchTerm || (log.campaignTitle || "No campaign").toLowerCase().includes(campaignSearchTerm)

      return statusMatches && campaignMatches && campaignSearchMatches
    })

    filtered.sort((a, b) =>
      activitySortOrder === "newest"
        ? new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
        : new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
    )

    return filtered
  }, [groupedActivityLogs, activityStatusFilter, activityCampaignFilter, activityCampaignSearch, activitySortOrder])

  const totalGroupedPages = Math.max(1, Math.ceil(filteredGroupedActivityLogs.length / ACTIVITY_PAGE_SIZE))
  const visibleGroupedStartIndex = (activityPage - 1) * ACTIVITY_PAGE_SIZE
  const visibleGroupedActivityLogs = filteredGroupedActivityLogs.slice(
    visibleGroupedStartIndex,
    visibleGroupedStartIndex + ACTIVITY_PAGE_SIZE
  )
  const visibleGroupedCount = visibleGroupedActivityLogs.length
  const visibleGroupedRangeStart = visibleGroupedCount > 0 ? visibleGroupedStartIndex + 1 : 0
  const visibleGroupedRangeEnd = Math.min(visibleGroupedStartIndex + visibleGroupedCount, filteredGroupedActivityLogs.length)

  const activitySummary = useMemo(() => {
    const recipientCount = filteredGroupedActivityLogs.reduce((sum, group) => sum + group.recipientCount, 0)
    const failedCount = filteredGroupedActivityLogs.filter((group) => group.status === "failed").length

    return {
      groupedCount: filteredGroupedActivityLogs.length,
      recipientCount,
      failedCount,
    }
  }, [filteredGroupedActivityLogs])
  const hasActivityFilters =
    activityStatusFilter !== "all" || activityCampaignFilter !== "all" || activityCampaignSearch.trim().length > 0

  useEffect(() => {
    setActivityPage((current) => Math.min(Math.max(current, 1), totalGroupedPages))
  }, [totalGroupedPages])

  useEffect(() => {
    setExpandedActivityRows([])
  }, [activityStatusFilter, activityCampaignFilter, activityCampaignSearch, activitySortOrder, activityPage, activityLogs])

  const toggleActivityRow = (groupId: string) => {
    setExpandedActivityRows((current) =>
      current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId]
    )
  }

  const handleActivityStatusFilterChange = (value: string) => {
    setActivityPage(1)
    setActivityStatusFilter(value as "all" | EmailLogSummary["status"])
  }

  const handleActivityCampaignFilterChange = (value: string) => {
    setActivityPage(1)
    setActivityCampaignFilter(value)
  }

  const handleActivityCampaignSearchChange = (value: string) => {
    setActivityPage(1)
    setActivityCampaignSearch(value)
  }

  const handleActivitySortOrderChange = (value: string) => {
    setActivityPage(1)
    setActivitySortOrder(value as "newest" | "oldest")
  }

 
  const hasTemplateChanges =
    Boolean(selectedWorkflow?.template) &&
    (templateSubject !== (selectedWorkflow?.template?.subjectTemplate || "") ||
      templateBody !== (selectedWorkflow?.template?.bodyTemplate || ""))
  const hasCustomPurpose = manualPurpose !== "custom" || Boolean(customPurposeText.trim())
  const canGenerateAi = Boolean(selectedCampaign && selectedSegment && hasCustomPurpose && !isLoadingEmailData)
  const isSendingManualUpdate = manualDeliveryStatus.type === "sending"
  const manualDeliveryDisabled =
    isLoadingEmailData || isSendingManualUpdate || !generatedDraft || !selectedSegment || selectedSegment.recipientsWithEmailCount <= 0



  return (
    <DashboardLayout role="fund_raiser">
      <div className="space-y-6">
        {emailDataError ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>Unable to load live email data</CardTitle>
              <CardDescription>{emailDataError}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {isLoadingEmailData ? (
          <Card>
            <CardHeader>
              <CardTitle>Loading email automation</CardTitle>
              <CardDescription>Fetching campaigns, donors, and saved workflow templates from the database.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Email automation</h1>
            <p className="text-muted-foreground">
              Manage automatic donor workflows, AI-assisted campaign updates, and live email activity from one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={activeSection === "automatic" ? "default" : "outline"} onClick={() => setActiveSection("automatic")} className="cursor-pointer disabled:cursor-not-allowed">
              <MessageSquareHeart className="mr-2 h-4 w-4" />
              Automatic workflows
            </Button>
            <Button type="button" variant={activeSection === "manual" ? "default" : "outline"} onClick={() => setActiveSection("manual")} className="cursor-pointer disabled:cursor-not-allowed">
              <WandSparkles className="mr-2 h-4 w-4" />
              Manual updates
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatsCard title="Emails sent" value={dashboard.stats.emailsSent} icon={<Mail className="h-4 w-4" />} />
          <StatsCard title="Donor emails" value={dashboard.stats.donorEmailsSent} icon={<MessageSquareHeart className="h-4 w-4" />} />
          <StatsCard title="Fund-raiser emails" value={dashboard.stats.fundRaiserEmailsSent} icon={<Send className="h-4 w-4" />} />
          <StatsCard title="Active workflows" value={dashboard.stats.activeRules} icon={<CheckCircle2 className="h-4 w-4" />} />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-6 py-3">
          <span className="text-base font-semibold text-foreground">Campaign context</span>
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="h-9 w-full cursor-pointer border-0 bg-transparent px-2 shadow-none md:w-[320px]">
              <SelectValue placeholder="Select a campaign" />
            </SelectTrigger>
            <SelectContent>
              {dashboard.fundRaiserCampaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeSection === "automatic" ? (
<div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
  <Card>
    <CardHeader>
      <CardTitle>Automatic workflows</CardTitle>
      <CardDescription>
        Turn workflows on or off, then select one to edit its template.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {workflowOrder.map((workflowKey) => {
        const item = dashboard.workflowItems.find((entry) => entry.rule.key === workflowKey)
        if (!item) return null

        const isSelected = item.rule.key === selectedWorkflowKey

        return (
          <button
            key={item.rule.id}
            type="button"
            onClick={() => setSelectedWorkflowKey(item.rule.key)}
            className={`w-full cursor-pointer rounded-lg border p-4 text-left transition ${
              isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{item.rule.label}</p>
                  {isSelected ? <Badge variant="secondary">Selected</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">{item.rule.description}</p>
                <p className="text-xs text-muted-foreground">
                  Trigger: {item.triggerSummary.triggeredWhen}
                </p>
              </div>

              <Switch
                className="cursor-pointer"
                checked={item.rule.isEnabled}
                onCheckedChange={() => handleToggleRule(item.rule.id)}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          </button>
        )
      })}
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>{selectedWorkflow?.template?.label || "Workflow template"}</CardTitle>
      <CardDescription>
        Edit the selected workflow template, then test or send it when needed.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Trigger:</span>{" "}
        {selectedTrigger?.triggeredWhen || "Choose a workflow to view its trigger."}
        {selectedTrigger?.eventAt ? (
          <>
            {" "}Last matched event: {formatDateTime(selectedTrigger.eventAt)}.
          </>
        ) : null}
      </div>

      {isFundRaiserAlertWorkflow ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          New donation alerts are sent automatically to the logged-in fund raiser when a completed donation is received.
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium">Subject template</label>
        <Input value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} />
      </div>
      

      <div className="space-y-2">
        <label className="text-sm font-medium">Body template</label>
        <Textarea
          value={templateBody}
          onChange={(event) => setTemplateBody(event.target.value)}
          rows={10}
         
        />
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        Supported placeholders: <code>{"{{campaignTitle}}"}</code>, <code>{"{{raisedAmount}}"}</code>, <code>{"{{targetAmount}}"}</code>, <code>{"{{donorCount}}"}</code>, <code>{"{{milestonePercent}}"}</code>, <code>{"{{fundRaiserName}}"}</code>, <code>{"{{recipientLabel}}"}</code>, <code>{"{{campaignUpdateTitle}}"}</code>, <code>{"{{campaignUpdateContent}}"}</code>, <code>{"{{campaignUpdateDate}}"}</code>
      </div>

      {templateSaveState.message ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            templateSaveState.type === "saved"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : templateSaveState.type === "dirty"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : templateSaveState.type === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-muted bg-muted/30 text-muted-foreground"
          }`}
        >
          {templateSaveState.message}
        </div>
      ) : null}

      {workflowActionState.message ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            workflowActionState.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : workflowActionState.type === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-muted bg-muted/30 text-muted-foreground"
          }`}
        >
          {workflowActionState.message}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleSaveTemplate} disabled={!hasTemplateChanges || templateSaveState.type === "saving"} className="cursor-pointer disabled:cursor-not-allowed">
              <Save className="mr-2 h-4 w-4" />
              {templateSaveState.type === "saving"
                ? "Saving..."
                : templateSaveState.type === "saved" && !hasTemplateChanges
                ? "Saved"
                : "Save template"}
            </Button>
        <Button type="button" variant="outline" onClick={handleResetTemplate} className="cursor-pointer disabled:cursor-not-allowed">
          <PencilLine className="mr-2 h-4 w-4" />
          Reset default
        </Button>
        <Button type="button" variant="outline" onClick={handleQuickTest} className="cursor-pointer disabled:cursor-not-allowed">
          <Mail className="mr-2 h-4 w-4" />
          Quick test
        </Button>

      </div>

      <p className="text-sm text-muted-foreground">
        Automatic workflow emails are sent when their trigger event occurs, such as a campaign update, donation, or milestone.
      </p>
    </CardContent>
  </Card>
</div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <Card>
              <CardHeader>
                <CardTitle>Manual updates</CardTitle>
                <CardDescription>
                  Choose a donor segment and email purpose, then generate an AI-assisted draft for the selected campaign context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Donor segment</label>
                  <Select value={selectedSegmentKey} onValueChange={(value) => setSelectedSegmentKey(value as DonorSegmentKey)}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Select a donor segment" />
                    </SelectTrigger>
                    <SelectContent>
                      {dashboard.segmentOptions.map((segment) => (
                        <SelectItem key={segment.key} value={segment.key}>
                          {segment.label} ({segment.recipientCount} recipients)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-sm text-muted-foreground">Recipients</p>
                    <p className="text-2xl font-semibold">{selectedSegment?.recipientCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-sm text-muted-foreground">Emails captured</p>
                    <p className="text-2xl font-semibold">{selectedSegment?.recipientsWithEmailCount ?? 0}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-sm text-muted-foreground">Selected audience</p>
                    <p className="text-base font-semibold">{selectedSegment?.label || "No segment selected"}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Email purpose</label>
                  <Select value={manualPurpose} onValueChange={(value) => setManualPurpose(value as EmailDraftPurpose)}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Select email purpose" />
                    </SelectTrigger>
                    <SelectContent>
                      {emailPurposeOptions.map((purpose) => (
                        <SelectItem key={purpose.value} value={purpose.value}>
                          {purpose.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {manualPurpose === "custom" ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Custom purpose</label>
                    <Input
                      value={customPurposeText}
                      onChange={(event) => setCustomPurposeText(event.target.value)}
                      placeholder="Example: Invite past donors to share the campaign with colleagues this week."
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Tone</label>
                  <Select value={manualTone} onValueChange={(value) => setManualTone(value as EmailDraftTone)}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      {toneOptions.map((tone) => (
                        <SelectItem key={tone} value={tone}>
                          {getEmailDraftToneLabel(tone)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Additional prompt message</label>
                  <Textarea
                    value={additionalPrompt}
                    onChange={(event) => setAdditionalPrompt(event.target.value)}
                    rows={5}
                    placeholder="Example: Mention that the campaign update should sound hopeful and highlight how close we are to the next target."
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => handleGenerateDraft(false)} disabled={isGenerating || !canGenerateAi} className="cursor-pointer disabled:cursor-not-allowed">
                    <WandSparkles className="mr-2 h-4 w-4" />
                    {isGenerating ? "Generating..." : "Generate with AI"}
                  </Button>
                </div>

                {!canGenerateAi ? (
                  <p className="text-sm text-muted-foreground">Select a campaign context, donor segment, and email purpose to generate an AI draft.</p>
                ) : null}
                {isGenerating ? <p className="text-sm text-muted-foreground">Generating AI draft...</p> : null}
                {!isGenerating && manualAiStatus.message ? (
                  <p className={`text-sm ${manualAiStatus.type === "error" ? "text-destructive" : manualAiStatus.type === "success" ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {manualAiStatus.message}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Generated draft</CardTitle>
                <CardDescription>
                  Review and edit the AI-generated draft before sending it to the selected donor segment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Subject</label>
                  <Input
                    value={generatedDraft?.subject || ""}
                    onChange={(event) => handleGeneratedDraftChange("subject", event.target.value)}
                    placeholder="Generate a draft to start editing"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Body</label>
                  <Textarea
                    value={generatedDraft?.body || ""}
                    onChange={(event) => handleGeneratedDraftChange("body", event.target.value)}
                    rows={12}
                    placeholder="The AI-generated draft will appear here."
                  />
                </div>

                {manualDeliveryStatus.message ? (
                  <div
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      manualDeliveryStatus.type === "error"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : manualDeliveryStatus.type === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-muted bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {manualDeliveryStatus.message}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => handleManualDelivery("send")} disabled={manualDeliveryDisabled} className="cursor-pointer disabled:cursor-not-allowed">
                    <Send className="mr-2 h-4 w-4" />
                    {isSendingManualUpdate ? "Sending..." : "Send now"}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={!generatedDraft || isSendingManualUpdate} className="cursor-pointer disabled:cursor-not-allowed">
                    <Save className="mr-2 h-4 w-4" />
                    Save draft
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Email activity</CardTitle>
              <CardDescription>
                Recent workflow tests and sent emails from both the automatic and manual sections.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {[
                  { label: "Email records", value: String(activityMeta.totalCount), icon: Mail, colour: "text-primary" },
                  { label: "Grouped sends", value: String(activitySummary.groupedCount), icon: Layers, colour: "text-blue-500" },
                  { label: "Recipients", value: String(activitySummary.recipientCount), icon: Users, colour: "text-green-600" },
                  { label: "Failed", value: String(activitySummary.failedCount), icon: AlertCircle, colour: "text-red-500" },
                ].map(({ label, value, icon: Icon, colour }) => (
                  <div key={label} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60">
                      <Icon className={`h-3.5 w-3.5 ${colour}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-bold leading-tight text-foreground">{value}</p>
                      <p className="truncate text-xs leading-tight text-muted-foreground">{label}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_155px_150px]">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Search campaign</span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={activityCampaignSearch}
                          onChange={(event) => handleActivityCampaignSearchChange(event.target.value)}
                          placeholder="Search campaign name"
                          className="h-9 bg-background pl-9 text-sm"
                        />
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Status</span>
                      <Select value={activityStatusFilter} onValueChange={handleActivityStatusFilterChange}>
                        <SelectTrigger className="h-9 cursor-pointer bg-background text-sm">
                          <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="queued">Queued</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>

                
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Sort</span>
                      <Select value={activitySortOrder} onValueChange={handleActivitySortOrderChange}>
                        <SelectTrigger className="h-9 cursor-pointer bg-background text-sm">
                          <SelectValue placeholder="Sort order" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newest">Newest first</SelectItem>
                          <SelectItem value="oldest">Oldest first</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 xl:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => refreshEmailsDashboard({ activityOnly: true, showToast: true })}
                      disabled={isLoadingEmailData || isRefreshingActivity}
                      className="h-9 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingActivity ? "animate-spin" : ""}`} />
                      {isRefreshingActivity ? "Refreshing..." : "Refresh"}
                    </Button>

                    {hasActivityFilters ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setActivityPage(1)
                          setActivityStatusFilter("all")
                          setActivityCampaignFilter("all")
                          setActivityCampaignSearch("")
                        }}
                        className="h-9 shrink-0 cursor-pointer px-3 text-sm"
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Clear
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {filteredGroupedActivityLogs.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="mb-1 text-base font-semibold">
                      {hasActivityFilters ? "No matching email activity" : "No email activity yet"}
                    </h3>
                    <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">
                      {hasActivityFilters
                        ? "Try clearing the status or campaign filter to see more email records."
                        : "Run a quick test or send a workflow/manual email to populate the activity log."}
                    </p>
                    {hasActivityFilters ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActivityPage(1)
                          setActivityStatusFilter("all")
                          setActivityCampaignFilter("all")
                          setActivityCampaignSearch("")
                        }}
                        className="cursor-pointer"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Clear filters
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              ) : (
                <div className="overflow-hidden rounded-xl border bg-card">
                  <div className="hidden grid-cols-[140px_minmax(260px,1fr)_220px_minmax(280px,0.8fr)] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                    <span>Status / date</span>
                    <span>Email details</span>
                    <span>Workflow</span>
                    <span>Recipients</span>
                  </div>

                  <div className="divide-y">
                    {visibleGroupedActivityLogs.map((group) => {
                      const isExpanded = expandedActivityRows.includes(group.id)
                      const firstRecipient = group.recipients[0]
                      const firstRecipientName = firstRecipient?.name || firstRecipient?.email || "Unnamed recipient"
                      const firstRecipientEmail = firstRecipient?.email && firstRecipient.email !== firstRecipientName ? firstRecipient.email : ""
                      const additionalRecipientCount = Math.max(0, group.recipientCount - 1)

                      return (
                        <div key={group.id} className="bg-card px-3 py-3 transition-colors hover:bg-muted/20">
                          <div className="grid gap-3 lg:grid-cols-[140px_minmax(260px,1fr)_220px_minmax(280px,0.8fr)] lg:items-center">
                            <div className="space-y-1">
                              <Badge
                                variant={group.status === "sent" ? "default" : group.status === "failed" ? "destructive" : "secondary"}
                                className="px-2 py-0.5 text-xs"
                              >
                                {group.statusLabel}
                              </Badge>
                              <p className="text-xs leading-snug text-muted-foreground">{formatDateTime(group.sentAt)}</p>
                            </div>

                            <div className="min-w-0 space-y-1">
                              <p className="truncate text-sm font-semibold text-foreground md:text-[15px]">{group.subject}</p>
                              <p className="truncate text-sm text-muted-foreground">{group.campaignTitle || "No campaign"}</p>
                            </div>

                            <div className="min-w-0 space-y-1">
                              <p className="truncate text-sm font-medium text-foreground">{group.ruleLabel}</p>
                              
                            </div>

                            <div className="min-w-0 rounded-lg bg-muted/20 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
                                    <Users className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold leading-tight text-foreground">{firstRecipientName}</p>
                                    <p className="truncate text-xs leading-snug text-muted-foreground">
                                      {firstRecipientEmail || "No email recorded"}
                                      {additionalRecipientCount > 0
                                        ? ` • ${additionalRecipientCount} more recipient${additionalRecipientCount === 1 ? "" : "s"}`
                                        : ""}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  <Badge variant="secondary" className="px-2 py-0.5 text-xs font-medium">
                                    {group.recipientCount} {group.recipientCount === 1 ? "recipient" : "recipients"}
                                  </Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 shrink-0 cursor-pointer px-2 text-xs"
                                    onClick={() => toggleActivityRow(group.id)}
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronDown className="mr-1 h-4 w-4" />
                                        Hide
                                      </>
                                    ) : (
                                      <>
                                        <ChevronRight className="mr-1 h-4 w-4" />
                                        List
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>

                          {isExpanded ? (
                            <div className="mt-3 border-t pt-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-foreground">Recipient list</p>
                                <p className="text-xs text-muted-foreground">{group.recipientCount} total</p>
                              </div>
                              <div className="grid gap-1.5 md:grid-cols-2">
                                {group.recipients.map((recipient, index) => (
                                  <div
                                    key={`${group.id}-${recipient.email || recipient.name}-${index}`}
                                    className="rounded-md bg-muted/30 px-2.5 py-1.5 text-sm"
                                  >
                                    <p className="truncate font-medium text-foreground">{recipient.name || recipient.email || "Unnamed recipient"}</p>
                                    {recipient.email ? <p className="truncate text-xs text-muted-foreground">{recipient.email}</p> : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {filteredGroupedActivityLogs.length > 0 ? (
                <div className="flex flex-col gap-2 border-t pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {activityMeta.totalCount} email record{activityMeta.totalCount === 1 ? "" : "s"} total • Page {activityPage} of {totalGroupedPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={activityPage <= 1 || isRefreshingActivity}
                      onClick={() => setActivityPage((current) => Math.max(1, current - 1))}
                      className="h-8 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={activityPage >= totalGroupedPages || isRefreshingActivity}
                      onClick={() => setActivityPage((current) => Math.min(totalGroupedPages, current + 1))}
                      className="h-8 cursor-pointer disabled:cursor-not-allowed"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saved AI drafts</CardTitle>
              <CardDescription>
                Reuse previously generated drafts, then continue editing or sending them from the manual update flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {savedDrafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved drafts yet.</p>
              ) : (
                savedDrafts.map((draft) => (
                  <div key={draft.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">{draft.subject}</p>
                        <p className="text-sm text-muted-foreground">{draft.previewText}</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Badge variant="secondary">{draft.toneLabel}</Badge>
                          {draft.segmentLabel ? <Badge variant="outline">{draft.segmentLabel}</Badge> : null}
                          <Badge variant="outline">{draft.variationLabel}</Badge>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => handleUseSavedDraft(draft)} className="cursor-pointer disabled:cursor-not-allowed">
                          Use draft
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleDeleteDraft(draft.id)} className="cursor-pointer disabled:cursor-not-allowed">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function FundRaiserEmailsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading email dashboard...</div>}>
      <FundRaiserEmailsPageContent />
    </Suspense>
  );
}
