"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  DollarSign,
  Search,
  Calendar,
  Download,
  ExternalLink,
  TrendingUp,
  Award,
  Clock,
  Grid3X3,
  List,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DashboardLayout } from "@/components/layout/dashboard-sidebar"
import { StatsCard } from "@/components/ui/stats-card"
import { useAuth } from "@/components/providers/session-provider"

type LinkedCampaign = {
  id: string
  title: string
  category?: string | null
  targetAmount?: number | null
  raisedAmount?: number | null
}

type RecentActivityItem = {
  type?: string
  campaignId?: string
  campaignTitle?: string
  campaign?: string
  title?: string
  amount?: number | null
  status?: string
  donorName?: string | null
  createdAt?: string
}

type DoneeDonation = {
  id: string
  amount: number
  status: string
  donorName: string | null
  createdAt: string
  campaignId: string
  campaign: {
    id: string
    title: string
    category: string
    targetAmount: number
    raisedAmount: number
  }
}

type DoneeDashboardResponse = {
  recentActivity?: RecentActivityItem[]
  linkedCampaigns?: LinkedCampaign[]
}

const REMOVED_CAMPAIGN_TITLE = "Scholarships for Underprivileged Students"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount)
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback
}

function getProgress(raisedAmount: number, targetAmount: number) {
  if (!targetAmount || targetAmount <= 0) return 0
  return Math.min(100, Math.round((raisedAmount / targetAmount) * 100))
}

function getCampaignTitle(item: RecentActivityItem) {
  return safeText(
    item.campaignTitle,
    safeText(item.campaign, safeText(item.title).replace("Donation received for ", ""))
  )
}

function normalizeDonation(
  item: RecentActivityItem,
  linkedCampaigns: LinkedCampaign[]
): DoneeDonation {
  const campaignTitle = getCampaignTitle(item) || "Unknown Campaign"

  const linkedCampaign =
    linkedCampaigns.find((campaign) => campaign.id === item.campaignId) ??
    linkedCampaigns.find((campaign) => campaign.title === campaignTitle)

  const campaignId =
    safeText(item.campaignId) ||
    safeText(linkedCampaign?.id) ||
    `${campaignTitle}-${item.createdAt ?? Date.now()}`

  const createdAt = item.createdAt ?? new Date().toISOString()

  return {
    id: `${campaignId}-${item.amount ?? 0}-${createdAt}`,
    amount: Number(item.amount ?? 0),
    status: item.status ?? "completed",
    donorName: item.donorName ?? null,
    createdAt,
    campaignId,
    campaign: {
      id: campaignId,
      title: campaignTitle,
      category: safeText(linkedCampaign?.category, "General"),
      targetAmount: Number(linkedCampaign?.targetAmount ?? 0),
      raisedAmount: Number(linkedCampaign?.raisedAmount ?? 0),
    },
  }
}

export default function DoneeDonationsPage() {
  const { user } = useAuth()

  const [doneeDonations, setDoneeDonations] = useState<DoneeDonation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("all")
  const [viewMode, setViewMode] = useState<"table" | "cards">("table")
  const [sortField, setSortField] = useState("date")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

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
          throw new Error("Failed to load received donations.")
        }

        return response.json()
      })
      .then((data: DoneeDashboardResponse) => {
        if (!isMounted) return

        const linkedCampaigns = (data.linkedCampaigns ?? []).filter(
          (campaign) => campaign.title !== REMOVED_CAMPAIGN_TITLE
        )

        const donations = (data.recentActivity ?? [])
          .filter((item) => item.type === "donation")
          .filter((item) => getCampaignTitle(item) !== REMOVED_CAMPAIGN_TITLE)
          .map((item) => normalizeDonation(item, linkedCampaigns))

        setDoneeDonations(donations)
      })
      .catch(() => {
        if (!isMounted) return
        setError("Unable to load received donations. Please try again.")
        setDoneeDonations([])
      })
      .finally(() => {
        if (!isMounted) return
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const totalReceived = doneeDonations.reduce(
    (sum, donation) => sum + donation.amount,
    0
  )

  const linkedCampaignsCount = new Set(
    doneeDonations.map((donation) => donation.campaignId)
  ).size

  const thisMonthReceived = doneeDonations
    .filter(
      (donation) =>
        new Date(donation.createdAt) >
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    )
    .reduce((sum, donation) => sum + donation.amount, 0)

  const availableCategories = Array.from(
    new Set(
      doneeDonations.map((donation) => donation.campaign?.category ?? "General")
    )
  )

  const filteredDonations = doneeDonations.filter((donation) => {
    const campaignTitle = donation.campaign?.title ?? ""
    const campaignCategory = donation.campaign?.category ?? "General"

    const matchesSearch = campaignTitle
      .toLowerCase()
      .includes(searchQuery.toLowerCase())

    const matchesCategory =
      categoryFilter === "all" || campaignCategory === categoryFilter

    let matchesDate = true

    if (dateFilter !== "all") {
      const donationDate = new Date(donation.createdAt)
      const now = new Date()

      switch (dateFilter) {
        case "week":
          matchesDate =
            donationDate > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case "month":
          matchesDate =
            donationDate > new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case "quarter":
          matchesDate =
            donationDate > new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        case "year":
          matchesDate =
            donationDate > new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
          break
      }
    }

    return matchesSearch && matchesCategory && matchesDate
  })

  const sortedDonations = [...filteredDonations].sort((a, b) => {
    let comparison = 0

    if (sortField === "date") {
      comparison =
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    }

    if (sortField === "amount") {
      comparison = a.amount - b.amount
    }

    if (sortField === "campaign") {
      comparison = (a.campaign?.title ?? "").localeCompare(
        b.campaign?.title ?? ""
      )
    }

    return sortDirection === "asc" ? comparison : -comparison
  })

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null

    return sortDirection === "asc" ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    )
  }

  return (
    <DashboardLayout role="donee" user={sidebarUser}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            Received Donations
          </h1>
          <p className="text-muted-foreground">
            Track donations received through fundraising activities linked to you.
          </p>
        </div>

        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
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
              Failed to load donations
            </h3>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatsCard
              title="Total Received"
              value={formatCurrency(totalReceived)}
              icon={<DollarSign className="h-5 w-5" />}
              description="Total support received"
            />
            <StatsCard
              title="Linked Fundraising Activities"
              value={linkedCampaignsCount.toString()}
              icon={<Award className="h-5 w-5" />}
              description="Campaigns linked to you"
            />
            <StatsCard
              title="This Month Received"
              value={formatCurrency(thisMonthReceived)}
              icon={<Clock className="h-5 w-5" />}
              description="Last 30 days"
            />
            <StatsCard
              title="Received Donations"
              value={doneeDonations.length.toString()}
              icon={<TrendingUp className="h-5 w-5" />}
              description="All received donations"
            />
          </div>

          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by fundraising activity..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-10"
                  />
                </div>

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {availableCategories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <Calendar className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Time period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                    <SelectItem value="quarter">Last 90 Days</SelectItem>
                    <SelectItem value="year">Last Year</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex border rounded-lg">
                  <Button
                    variant={viewMode === "table" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("table")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === "cards" ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setViewMode("cards")}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {sortedDonations.length > 0 ? (
            viewMode === "table" ? (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          onClick={() => handleSort("date")}
                          className="cursor-pointer hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-1">
                            Date <SortIcon field="date" />
                          </div>
                        </TableHead>
                        <TableHead
                          onClick={() => handleSort("campaign")}
                          className="cursor-pointer hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-1">
                            Fundraising Activity <SortIcon field="campaign" />
                          </div>
                        </TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead
                          onClick={() => handleSort("amount")}
                          className="cursor-pointer hover:bg-muted/50 text-right"
                        >
                          <div className="flex items-center justify-end gap-1">
                            Amount Received <SortIcon field="amount" />
                          </div>
                        </TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Payment Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {sortedDonations.map((donation) => {
                        const progress = getProgress(
                          donation.campaign?.raisedAmount ?? 0,
                          donation.campaign?.targetAmount ?? 0
                        )

                        return (
                          <TableRow key={donation.id}>
                            <TableCell className="font-medium">
                              {new Date(donation.createdAt).toLocaleDateString(
                                "en-AU"
                              )}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/dashboard/donee/activities?activityId=${donation.campaign.id}`}
                                className="hover:text-primary transition-colors"
                              >
                                {donation.campaign.title}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {donation.campaign.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {formatCurrency(donation.amount)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={progress} className="h-2 w-20" />
                                <span className="text-xs text-muted-foreground">
                                  {progress}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  donation.status === "completed"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {donation.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Link
                                href={`/dashboard/donee/activities?activityId=${donation.campaign.id}`}
                              >
                                <Button variant="ghost" size="sm">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </Link>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedDonations.map((donation) => {
                  const progress = getProgress(
                    donation.campaign?.raisedAmount ?? 0,
                    donation.campaign?.targetAmount ?? 0
                  )

                  return (
                    <Card key={donation.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <Badge variant="outline">
                            {donation.campaign.category}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {new Date(donation.createdAt).toLocaleDateString(
                              "en-AU"
                            )}
                          </span>
                        </div>
                        <Link
                          href={`/dashboard/donee/activities?activityId=${donation.campaign.id}`}
                        >
                          <h3 className="font-semibold text-foreground mb-2 hover:text-primary transition-colors line-clamp-2">
                            {donation.campaign.title}
                          </h3>
                        </Link>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-2xl font-bold text-primary">
                            {formatCurrency(donation.amount)}
                          </span>
                          <Badge
                            variant={
                              donation.status === "completed"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {donation.status}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>Fundraising Progress</span>
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <DollarSign className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">
                  No received donations found
                </h3>
                <p className="text-muted-foreground">
                  No donations have been received for your linked fundraising
                  activities yet.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </DashboardLayout>
  )
}
