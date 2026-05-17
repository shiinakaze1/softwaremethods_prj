"use client"

import { useEffect, useState } from "react"
import {
  MessageSquare,
  Search,
  Heart,
  CalendarDays,
  User,
  EyeOff,
  Copy,
  WandSparkles,
  CheckCircle2,
  Send,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { DashboardLayout } from "@/components/layout/dashboard-sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/components/providers/session-provider"

type LinkedCampaign = {
  id: string
  title: string
  category?: string | null
  raisedAmount?: number | null
  targetAmount?: number | null
  donorCount?: number | null
}

type DonorMessageApi = {
  id?: string
  message?: string | null
  donorName?: string | null
  isAnonymous?: boolean | null
  amount?: number | null
  createdAt?: string
  campaignId?: string
  campaignTitle?: string
  campaign?: {
    id?: string
    title?: string
    category?: string | null
    raisedAmount?: number | null
    targetAmount?: number | null
    donorCount?: number | null
  }
}

type DonorMessage = {
  id: string
  message: string
  donorName: string
  isAnonymous: boolean
  amount: number
  createdAt: string
  campaign: LinkedCampaign
}

type DoneeDashboardResponse = {
  donorMessages?: DonorMessageApi[]
  linkedCampaigns?: LinkedCampaign[]
}

const REMOVED_CAMPAIGN_TITLE = "Scholarships for Underprivileged Students"

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback
}

function normalizeMessage(
  item: DonorMessageApi,
  linkedCampaigns: LinkedCampaign[]
): DonorMessage | null {
  const message = safeText(item.message)
  if (!message) return null

  const campaignTitle = safeText(
    item.campaign?.title,
    safeText(item.campaignTitle, "Unknown Campaign")
  )

  if (campaignTitle === REMOVED_CAMPAIGN_TITLE) return null

  const linkedCampaign =
    linkedCampaigns.find((campaign) => campaign.id === item.campaignId) ??
    linkedCampaigns.find((campaign) => campaign.title === campaignTitle)

  const campaign: LinkedCampaign = {
    id: item.campaignId ?? linkedCampaign?.id ?? item.campaign?.id ?? campaignTitle,
    title: linkedCampaign?.title ?? item.campaign?.title ?? campaignTitle,
    category: linkedCampaign?.category ?? item.campaign?.category ?? "General",
    raisedAmount: linkedCampaign?.raisedAmount ?? item.campaign?.raisedAmount ?? 0,
    targetAmount: linkedCampaign?.targetAmount ?? item.campaign?.targetAmount ?? 0,
    donorCount: linkedCampaign?.donorCount ?? item.campaign?.donorCount ?? 0,
  }

  return {
    id:
      item.id ??
      `${campaign.id}-${item.amount ?? 0}-${item.createdAt ?? Date.now()}`,
    message,
    donorName: item.isAnonymous
      ? "Anonymous"
      : safeText(item.donorName, "Unknown Donor"),
    isAnonymous: Boolean(item.isAnonymous),
    amount: Number(item.amount ?? 0),
    createdAt: item.createdAt ?? new Date().toISOString(),
    campaign,
  }
}

export default function DoneeMessagesPage() {
  const { user } = useAuth()
  const [donorMessages, setDonorMessages] = useState<DonorMessage[]>([])
  const [linkedCampaigns, setLinkedCampaigns] = useState<LinkedCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [campaignFilter, setCampaignFilter] = useState("all")

  const [selectedDraftCampaign, setSelectedDraftCampaign] = useState("first")
  const [draftTone, setDraftTone] = useState("warm")
  const [draftLoading, setDraftLoading] = useState(false)
  const [thankYouDraft, setThankYouDraft] = useState("")
  const [copied, setCopied] = useState(false)

  const sidebarUser = user
    ? {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: "Donee",
      }
    : undefined

  useEffect(() => {
    let isMounted = true

    setLoading(true)
    setError("")

    fetch("/api/donee/dashboard")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load donor messages.")
        }

        return response.json()
      })
      .then((data: DoneeDashboardResponse) => {
        if (!isMounted) return

        const campaigns = (data.linkedCampaigns ?? []).filter(
          (campaign) => campaign.title !== REMOVED_CAMPAIGN_TITLE
        )

        const messages = (data.donorMessages ?? [])
          .map((item) => normalizeMessage(item, campaigns))
          .filter((item): item is DonorMessage => Boolean(item))

        setLinkedCampaigns(campaigns)
        setDonorMessages(messages)
      })
      .catch(() => {
        if (!isMounted) return
        setError("Unable to load donor messages. Please try again.")
        setLinkedCampaigns([])
        setDonorMessages([])
      })
      .finally(() => {
        if (!isMounted) return
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const campaignOptions = Array.from(
    new Map(donorMessages.map((item) => [item.campaign.id, item.campaign])).values()
  )

  const filteredMessages = donorMessages.filter((item) => {
    const matchesSearch =
      item.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.campaign.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.donorName.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCampaign =
      campaignFilter === "all" || item.campaign.id === campaignFilter

    return matchesSearch && matchesCampaign
  })

  const generateThankYouDraft = async () => {
    const selectedCampaign =
      selectedDraftCampaign === "first"
        ? donorMessages[0]?.campaign ?? linkedCampaigns[0]
        : linkedCampaigns.find(
            (campaign) => campaign.id === selectedDraftCampaign
          )

    if (!selectedCampaign) return

    setDraftLoading(true)
    setCopied(false)

    try {
      const response = await fetch("/api/donee/thank-you-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignId: selectedCampaign.id,
          tone: draftTone,
          campaign: {
            title: selectedCampaign.title,
            category: selectedCampaign.category,
            raisedAmount: selectedCampaign.raisedAmount ?? 0,
            targetAmount: selectedCampaign.targetAmount ?? 0,
            donorCount: selectedCampaign.donorCount ?? 0,
          },
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate draft")
      }

      const data = await response.json()
      setThankYouDraft(data.draft || "")
    } catch {
      setThankYouDraft("Unable to generate thank-you draft. Please try again.")
    } finally {
      setDraftLoading(false)
    }
  }

  const copyThankYouDraft = async () => {
    if (!thankYouDraft) return

    await navigator.clipboard.writeText(thankYouDraft)
    setCopied(true)
  }

  return (
    <DashboardLayout role="donee" user={sidebarUser}>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
          Donor Encouragement Messages
        </h1>
        <p className="text-muted-foreground">
          View messages left by donors on fundraising activities linked to you.
          Anonymous donor identities are hidden.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">
              Failed to load messages
            </h3>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardContent className="p-5">
                <MessageSquare className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">{donorMessages.length}</p>
                <p className="text-sm text-muted-foreground">
                  Messages Received
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <Heart className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">{campaignOptions.length}</p>
                <p className="text-sm text-muted-foreground">Linked Activities</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <EyeOff className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">
                  {donorMessages.filter((item) => item.isAnonymous).length}
                </p>
                <p className="text-sm text-muted-foreground">Anonymous Donors</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search messages, donors, or fundraising activities..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-10"
                  />
                </div>

                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger className="w-full md:w-[260px]">
                    <SelectValue placeholder="Fundraising Activity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Fundraising Activities</SelectItem>
                    {campaignOptions.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6 overflow-hidden">
            <div className="border-b bg-muted/30 px-5 py-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <WandSparkles className="h-5 w-5 text-primary" />
                    Thank Supporters
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Generate a thank-you message based on donor support,
                    campaign progress, and recent encouragement messages.
                  </p>
                </div>

                <Badge variant="secondary" className="w-fit">
                  Donee helper
                </Badge>
              </div>
            </div>

            <CardContent className="p-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm font-medium mb-2">Fundraising Activity</p>
                  <Select
                    value={selectedDraftCampaign}
                    onValueChange={setSelectedDraftCampaign}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select activity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">
                        Use latest supported activity
                      </SelectItem>
                      {linkedCampaigns.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Message Tone</p>
                  <Select value={draftTone} onValueChange={setDraftTone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warm">Warm</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="emotional">Emotional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    className="w-full"
                    onClick={generateThankYouDraft}
                    disabled={draftLoading || donorMessages.length === 0}
                  >
                    <WandSparkles className="h-4 w-4 mr-2" />
                    {draftLoading ? "Generating..." : "Generate Draft"}
                  </Button>
                </div>
              </div>

              {thankYouDraft ? (
                <div className="mt-5 rounded-xl border bg-background p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        Suggested Thank-You Message
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Review and copy this message before sending it to
                        supporters.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyThankYouDraft}
                      >
                        {copied ? (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        ) : (
                          <Copy className="h-4 w-4 mr-2" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </Button>

                      <Button size="sm" disabled>
                        <Send className="h-4 w-4 mr-2" />
                        Send Later
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-4">
                    <p className="text-sm whitespace-pre-line leading-relaxed">
                      {thankYouDraft}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed bg-muted/20 p-5 text-center">
                  <WandSparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">No draft generated yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose a campaign and tone, then generate a thank-you message.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mb-4">
            <h2 className="text-lg font-semibold">Encouragement Wall</h2>
            <p className="text-sm text-muted-foreground">
              Messages of support from donors across your linked fundraising
              activities.
            </p>
          </div>

          {filteredMessages.length > 0 ? (
            <div className="space-y-4">
              {filteredMessages.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          {item.isAnonymous ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}

                          <span className="font-semibold">{item.donorName}</span>

                          {item.isAnonymous && (
                            <Badge variant="outline">Anonymous</Badge>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground">
                          {item.campaign.title}
                        </p>
                      </div>

                      <div className="flex flex-col md:items-end gap-2">
                        <Badge variant="secondary">
                          ${item.amount.toLocaleString()} donated
                        </Badge>

                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <CalendarDays className="h-4 w-4" />
                          {formatDate(item.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted/50 p-4">
                      <p className="text-sm leading-relaxed">“{item.message}”</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>

                <h3 className="text-lg font-semibold mb-2">
                  No donor messages found
                </h3>

                <p className="text-muted-foreground max-w-md mx-auto">
                  {searchQuery || campaignFilter !== "all"
                    ? "Try adjusting your filters to view more donor messages."
                    : "No donor encouragement messages have been received yet."}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </DashboardLayout>
  )
}
