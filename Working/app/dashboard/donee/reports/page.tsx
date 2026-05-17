"use client"

import { useEffect, useState } from "react"
import {
  Download,
  FileText,
  DollarSign,
  Target,
  CheckCircle,
  AlertCircle,
  Loader2,
  HandHeart,
} from "lucide-react"
import { DashboardLayout } from "@/components/layout/dashboard-sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/components/providers/session-provider"

type LinkedCampaign = {
  id: string
  title: string
  summary?: string | null
  category?: string | null
  status?: string | null
  targetAmount?: number | null
  raisedAmount?: number | null
  donorCount?: number | null
  startDate?: string | null
  endDate?: string | null
}

type ReportRow = {
  id: string
  title: string
  category: string
  status: string
  targetAmount: number
  raisedAmount: number
  progress: number
}

type DoneeDashboardResponse = {
  linkedCampaigns?: LinkedCampaign[]
}

const REMOVED_CAMPAIGN_KEYWORD = "scholarship"

function isRemovedCampaign(title?: string | null) {
  return (title ?? "").toLowerCase().includes(REMOVED_CAMPAIGN_KEYWORD)
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount)
}

function getProgress(raisedAmount: number, targetAmount: number) {
  if (!targetAmount || targetAmount <= 0) return 0
  return Math.min(100, Math.round((raisedAmount / targetAmount) * 100))
}

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          const safeValue = value.replace(/"/g, '""')
          return `"${safeValue}"`
        })
        .join(",")
    )
    .join("\n")

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

export default function DoneeReportsPage() {
  const { user } = useAuth()
  const [reportRows, setReportRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [downloaded, setDownloaded] = useState(false)

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
          throw new Error("Failed to load report data.")
        }

        return response.json()
      })
      .then((data: DoneeDashboardResponse) => {
        if (!isMounted) return

        const rows = (data.linkedCampaigns ?? [])
          .filter((campaign) => !isRemovedCampaign(campaign.title))
          .map((campaign) => {
            const targetAmount = Number(campaign.targetAmount ?? 0)
            const raisedAmount = Number(campaign.raisedAmount ?? 0)

            return {
              id: campaign.id,
              title: campaign.title,
              category: campaign.category ?? "General",
              status: campaign.status ?? "active",
              targetAmount,
              raisedAmount,
              progress: getProgress(raisedAmount, targetAmount),
            }
          })

        setReportRows(rows)
      })
      .catch(() => {
        if (!isMounted) return
        setError("Unable to load fundraising support report. Please try again.")
        setReportRows([])
      })
      .finally(() => {
        if (!isMounted) return
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const totalRaised = reportRows.reduce(
    (sum, row) => sum + row.raisedAmount,
    0
  )

  const totalTarget = reportRows.reduce(
    (sum, row) => sum + row.targetAmount,
    0
  )

  const averageProgress = reportRows.length
    ? Math.round(
        reportRows.reduce((sum, row) => sum + row.progress, 0) /
          reportRows.length
      )
    : 0

  const handleDownload = () => {
    const rows = [
      [
        "Fundraising Activity",
        "Category",
        "Status",
        "Target Amount",
        "Raised Amount",
        "Progress Percentage",
      ],
      ...reportRows.map((row) => [
        row.title,
        row.category,
        row.status,
        String(row.targetAmount),
        String(row.raisedAmount),
        `${row.progress}%`,
      ]),
    ]

    downloadCSV("donee_fundraising_support_summary_report.csv", rows)
    setDownloaded(true)
  }

  return (
    <DashboardLayout role="donee" user={sidebarUser}>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
          Fundraising Support Summary Report
        </h1>
        <p className="text-muted-foreground">
          Download a summary report of funds and support received from
          fundraising activities linked to you.
        </p>
      </div>

      {downloaded && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-green-50 p-4 text-sm text-green-700">
          <CheckCircle className="h-4 w-4" />
          CSV report downloaded successfully.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">
              Failed to load report
            </h3>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-5">
                <DollarSign className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">
                  {formatCurrency(totalRaised)}
                </p>
                <p className="text-sm text-muted-foreground">Total Raised</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <Target className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">
                  {formatCurrency(totalTarget)}
                </p>
                <p className="text-sm text-muted-foreground">Total Goal</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <HandHeart className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">{reportRows.length}</p>
                <p className="text-sm text-muted-foreground">
                  Linked Activities
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <FileText className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">{averageProgress}%</p>
                <p className="text-sm text-muted-foreground">
                  Average Progress
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Support Summary</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Review linked fundraising activity progress before downloading
                  the CSV report.
                </p>
              </div>

              <Button onClick={handleDownload} disabled={reportRows.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            </CardHeader>

            <CardContent>
              {reportRows.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fundraising Activity</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Raised</TableHead>
                      <TableHead className="text-right">Goal</TableHead>
                      <TableHead>Progress</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {reportRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium max-w-[320px]">
                          {row.title}
                        </TableCell>

                        <TableCell>
                          <Badge variant="outline">{row.category}</Badge>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              row.status === "active" ? "default" : "secondary"
                            }
                          >
                            {row.status}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right font-semibold">
                          {formatCurrency(row.raisedAmount)}
                        </TableCell>

                        <TableCell className="text-right">
                          {formatCurrency(row.targetAmount)}
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={row.progress} className="h-2 w-24" />
                            <span className="text-xs text-muted-foreground">
                              {row.progress}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-16 text-center">
                  <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">
                    No report available
                  </h3>
                  <p className="text-muted-foreground">
                    No fundraising activities are currently linked to your Donee
                    account.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </DashboardLayout>
  )
}
