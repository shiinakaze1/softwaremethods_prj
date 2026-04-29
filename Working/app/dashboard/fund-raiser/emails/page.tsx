"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageSquareHeart,
  PencilLine,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react"
import { DashboardLayout } from "@/components/layout/dashboard-sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { StatsCard } from "@/components/ui/stats-card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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

function formatDateTime(value?: string) {
  if (!value) return "No event timestamp"
  return new Date(value).toLocaleString()
}

function groupEmailActivity(logs: EmailLogSummary[]): GroupedEmailActivity[] {
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
        name: log.recipientName,
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
          name: log.recipientName,
          email: log.recipientEmail,
        },
      ],
    })
  }

  return Array.from(grouped.values())
}

export default function FundRaiserEmailsPage() {
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

  const [activityStatusFilter, setActivityStatusFilter] = useState<"all" | EmailLogSummary["status"]>("all")
  const [activityCampaignFilter, setActivityCampaignFilter] = useState<string>("all")
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
      const requestedPage = options?.page ?? activityPage
      const activityOnly = options?.activityOnly ?? hasLoadedEmailDataRef.current
      const params = new URLSearchParams({
        logsPage: String(requestedPage),
        logsPageSize: String(ACTIVITY_PAGE_SIZE),
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
          page: requestedPage,
          pageSize: ACTIVITY_PAGE_SIZE,
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
        setActivityPage(nextLogsMeta.page)
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
    [activityCampaignFilter, activityPage, activitySortOrder, activityStatusFilter]
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

  const handleAutomaticDelivery = async () => {
    if (!selectedWorkflow?.template) return

    try {
      setWorkflowActionState({ type: "idle", message: "" })

      const result = await emailAutomationController.deliverAutomaticWorkflowEmail({
        ruleKey: selectedWorkflow.rule.key,
        templateSummary: selectedWorkflow.template,
        fundRaiserUser: resolvedFundRaiserUser,
        campaign: selectedCampaign,
        deliveryMode: "send",
        logs: activityLogs,
      })

      setActivityLogs((current) => [result.log, ...current])
      setWorkflowActionState({
        type: "success",
        message: `Workflow email sent successfully to ${result.deliveredCount} recipient${result.deliveredCount === 1 ? "" : "s"}.`,
      })
      toast({
        title: "Workflow sent",
        description: `Email sent to ${result.deliveredCount} recipient${result.deliveredCount === 1 ? "" : "s"}.`,
      })
    } catch (error) {
      setWorkflowActionState({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to send workflow.",
      })
      toast({
        title: "Unable to send workflow",
        description: error instanceof Error ? error.message : "Please review the selected campaign and try again.",
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
        description: "You can edit the subject and message before saving or sending.",
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
      toast({
        title: "No draft selected",
        description: "Generate or choose a saved draft first.",
        variant: "destructive",
      })
      return
    }

    try {
      const result = await emailAutomationController.deliverManualAudienceEmail({
        draft: generatedDraft,
        campaign: selectedCampaign,
        selectedSegment,
        deliveryMode,
      })

      setActivityLogs((current) => [result.log, ...current])
      toast({
        title: deliveryMode === "send" ? "Manual update sent" : "Manual update queued",
        description:
          deliveryMode === "send"
            ? `Email sent to ${result.deliveredCount} recipient${result.deliveredCount === 1 ? "" : "s"}.`
            : "The manual update was queued for the selected donor segment.",
      })
    } catch (error) {
      toast({
        title: deliveryMode === "send" ? "Unable to send manual update" : "Unable to queue manual update",
        description: error instanceof Error ? error.message : "Please review the selected campaign and audience.",
        variant: "destructive",
      })
    }
  }

  const handleGeneratedDraftChange = (field: "subject" | "body", value: string) => {
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
    }

    toast({ title: "Draft deleted", description: "The saved draft was removed." })
  }


  const groupedActivityLogs = useMemo(() => groupEmailActivity(dashboard.logs), [dashboard.logs])

  const activityCampaignOptions = useMemo(
    () =>
      dashboard.fundRaiserCampaigns.map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
      })),
    [dashboard.fundRaiserCampaigns]
  )

  const filteredGroupedActivityLogs = useMemo(() => {
    const filtered = groupedActivityLogs.filter((log) => {
      const statusMatches = activityStatusFilter === "all" || log.status === activityStatusFilter
      const campaignMatches =
        activityCampaignFilter === "all" || (log.campaignId || log.campaignTitle || "unknown") === activityCampaignFilter

      return statusMatches && campaignMatches
    })

    filtered.sort((a, b) =>
      activitySortOrder === "newest"
        ? new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
        : new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
    )

    return filtered
  }, [groupedActivityLogs, activityStatusFilter, activityCampaignFilter, activitySortOrder])

  const visibleGroupedActivityLogs = filteredGroupedActivityLogs
  const firstActivityRecord = activityMeta.totalCount === 0 ? 0 : (activityMeta.page - 1) * activityMeta.pageSize + 1
  const lastActivityRecord = Math.min(activityMeta.page * activityMeta.pageSize, activityMeta.totalCount)

  useEffect(() => {
    setExpandedActivityRows([])
  }, [activityStatusFilter, activityCampaignFilter, activitySortOrder, activityPage, activityLogs])

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

  const handleActivitySortOrderChange = (value: string) => {
    setActivityPage(1)
    setActivitySortOrder(value as "newest" | "oldest")
  }

  const automaticActionsDisabled =
    isLoadingEmailData || !selectedWorkflow?.rule.isEnabled || !selectedTrigger?.isReadyNow || !selectedWorkflow?.template
  const hasTemplateChanges =
    Boolean(selectedWorkflow?.template) &&
    (templateSubject !== (selectedWorkflow?.template?.subjectTemplate || "") ||
      templateBody !== (selectedWorkflow?.template?.bodyTemplate || ""))
  const hasCustomPurpose = manualPurpose !== "custom" || Boolean(customPurposeText.trim())
  const canGenerateAi = Boolean(selectedCampaign && selectedSegment && hasCustomPurpose && !isLoadingEmailData)
  const manualDeliveryDisabled =
    isLoadingEmailData || !generatedDraft || !selectedSegment || selectedSegment.recipientsWithEmailCount <= 0



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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-sm text-muted-foreground">Audience</p>
          <p className="text-base font-semibold">{automaticAudience?.label || "No workflow selected"}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-muted-foreground">Recipients</p>
          <p className="text-2xl font-semibold">{automaticAudience?.recipientCount ?? 0}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm text-muted-foreground">Emails captured</p>
          <p className="text-2xl font-semibold">{automaticAudience?.recipientsWithEmailCount ?? 0}</p>
        </div>
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
        <Button type="button" onClick={handleAutomaticDelivery} disabled={automaticActionsDisabled} className="cursor-pointer disabled:cursor-not-allowed">
          <Send className="mr-2 h-4 w-4" />
          Send workflow now
        </Button>
      </div>

      {automaticActionsDisabled ? (
        <p className="text-sm text-muted-foreground">
          {!selectedWorkflow?.rule.isEnabled
            ? "Turn this workflow on before sending it."
            : selectedTrigger?.statusReason || "This workflow is waiting for its trigger condition."}
        </p>
      ) : null}
    </CardContent>
  </Card>
</div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
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
                  <Button type="button" variant="outline" onClick={() => handleGenerateDraft(true)} disabled={isGenerating || !generatedDraft || !canGenerateAi} className="cursor-pointer disabled:cursor-not-allowed">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Regenerate variation
                  </Button>
                  <Button type="button" variant="outline" onClick={handleSaveDraft} disabled={!generatedDraft} className="cursor-pointer disabled:cursor-not-allowed">
                    <Save className="mr-2 h-4 w-4" />
                    Save generated content
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

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => handleManualDelivery("send")} disabled={manualDeliveryDisabled} className="cursor-pointer disabled:cursor-not-allowed">
                    <Send className="mr-2 h-4 w-4" />
                    Send now
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.5fr]">
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Email activity</CardTitle>
                <CardDescription>
                  Recent workflow tests and sent emails from both the automatic and manual sections.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refreshEmailsDashboard({ activityOnly: true, showToast: true })}
                disabled={isLoadingEmailData || isRefreshingActivity}
                className="cursor-pointer disabled:cursor-not-allowed"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingActivity ? "animate-spin" : ""}`} />
                {isRefreshingActivity ? "Refreshing..." : "Refresh"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select value={activityStatusFilter} onValueChange={handleActivityStatusFilterChange}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="queued">Queued</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={activityCampaignFilter} onValueChange={handleActivityCampaignFilterChange}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Filter by campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All campaigns</SelectItem>
                      {activityCampaignOptions.map((campaignOption) => (
                        <SelectItem key={campaignOption.id} value={campaignOption.id}>
                          {campaignOption.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={activitySortOrder} onValueChange={handleActivitySortOrderChange}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Sort order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-sm text-muted-foreground">
                  Showing {firstActivityRecord}-{lastActivityRecord} of {activityMeta.totalCount} email log records
                </p>
              </div>

              <Table className="table-fixed">
                <colgroup>
                  <col className="w-[15%]" />
                  <col className="w-[21%]" />
                  <col className="w-[15%]" />
                  <col className="w-[11%]" />
                  <col className="w-[23%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Date sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroupedActivityLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No email activity yet. Run a quick test or send a workflow/manual email to populate the activity log.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleGroupedActivityLogs.flatMap((group) => {
                      const isExpanded = expandedActivityRows.includes(group.id)

                      return [
                        <TableRow key={group.id}>
                          <TableCell className="overflow-hidden align-top">
                            <div className="min-w-0 space-y-1">
                              <p className="truncate font-medium" title={group.ruleLabel}>{group.ruleLabel}</p>
                              <p className="truncate text-xs text-muted-foreground" title={group.ruleKey}>{group.ruleKey}</p>
                            </div>
                          </TableCell>
                          <TableCell className="truncate align-top" title={group.campaignTitle || "No campaign"}>{group.campaignTitle || "No campaign"}</TableCell>
                          <TableCell className="overflow-hidden align-top">
                            <div className="min-w-0 space-y-2">
                              <p className="truncate font-medium">{group.recipientCount} recipient{group.recipientCount === 1 ? "" : "s"}</p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto px-0 py-0 text-sm cursor-pointer"
                                onClick={() => toggleActivityRow(group.id)}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronDown className="mr-1 h-4 w-4" />
                                    Hide recipients
                                  </>
                                ) : (
                                  <>
                                    <ChevronRight className="mr-1 h-4 w-4" />
                                    Show recipients
                                  </>
                                )}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="overflow-hidden align-top">
                            <Badge variant={group.status === "sent" ? "default" : group.status === "failed" ? "destructive" : "secondary"}>
                              {group.statusLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="truncate align-top" title={group.subject}>{group.subject}</TableCell>
                          <TableCell className="whitespace-nowrap align-top text-sm">{formatDateTime(group.sentAt)}</TableCell>
                        </TableRow>,
                        ...(isExpanded
                          ? [
                              <TableRow key={`${group.id}-expanded`}>
                                <TableCell colSpan={6} className="bg-muted/20">
                                  <div className="space-y-2 py-1">
                                    <p className="text-sm font-medium">Recipients</p>
                                    <div className="space-y-2">
                                      {group.recipients.map((recipient, index) => (
                                        <div key={`${group.id}-${recipient.email || recipient.name}-${index}`} className="rounded-md border bg-background px-3 py-2 text-sm">
                                          <p className="text-muted-foreground">{recipient.name || recipient.email || "Unnamed recipient"}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>,
                            ]
                          : []),
                      ]
                    })
                  )}
                </TableBody>
              </Table>

              {activityMeta.totalPages > 1 ? (
                <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {activityMeta.page} of {activityMeta.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={activityMeta.page <= 1 || isRefreshingActivity}
                      onClick={() => setActivityPage((current) => Math.max(1, current - 1))}
                      className="cursor-pointer disabled:cursor-not-allowed"
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={activityMeta.page >= activityMeta.totalPages || isRefreshingActivity}
                      onClick={() => setActivityPage((current) => Math.min(activityMeta.totalPages, current + 1))}
                      className="cursor-pointer disabled:cursor-not-allowed"
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
