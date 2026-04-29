"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/providers/session-provider"
import {
  Download,
  FileText,
  Users,
  DollarSign,
  BarChart3,
  Flag,
  Calendar,
  CheckCircle,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DashboardLayout } from "@/components/layout/dashboard-sidebar"

type ReportType = 'users' | 'campaigns' | 'donations' | 'platform' | 'reports'

interface DbUser {
  id: string
  email: string
  displayName: string
  role: string
  status: string
  isVerified: boolean
  location: string | null
  createdAt: string
  lastLoginAt: string | null
}

interface DbCampaign {
  id: string
  title: string
  category: string
  serviceType: string
  status: string
  targetAmount: number
  raisedAmount: number
  donorCount: number
  views: number
  organiserName: string
  createdAt: string
  endDate: string | null
  location: string
}

interface DbDonation {
  id: string
  amount: number
  donorName: string
  isAnonymous: boolean
  campaignTitle: string
  category: string
  status: string
  createdAt: string
}

interface DbReport {
  id: string
  reason: string
  description: string
  status: string
  resolvedBy: string | null
  resolution: string | null
  createdAt: string
  campaignTitle: string
  reporterName: string
  reporterEmail: string
}

interface PlatformStats {
  totalUsers: number
  activeUsers: number
  suspendedUsers: number
  frozenUsers: number
  totalFundRaisers: number
  totalDonees: number
  totalCampaigns: number
  activeCampaigns: number
  completedCampaigns: number
  draftCampaigns: number
  totalDonations: number
  totalDonationAmount: number
  averageDonation: number
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function downloadCSV(filename: string, headers: string[], rows: (string | number)[]) {
  const escape = (v: string | number) => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const csv = [headers, ...rows].map(row => (row as (string | number)[]).map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function filterByDate<T extends { createdAt: string }>(arr: T[], startDate: string, endDate: string) {
  return arr.filter(r => {
    const d = r.createdAt
    return (!startDate || d >= startDate) && (!endDate || d <= endDate + 'T23:59:59Z')
  })
}

export default function ExportReportsPage() {
  const { user: sessionUser } = useAuth()
  const router = useRouter()

  const [dbUsers, setDbUsers] = useState<DbUser[]>([])
  const [dbCampaigns, setDbCampaigns] = useState<DbCampaign[]>([])
  const [dbDonations, setDbDonations] = useState<DbDonation[]>([])
  const [dbReports, setDbReports] = useState<DbReport[]>([])
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)

  const [selectedType, setSelectedType] = useState<ReportType>('platform')
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [exporting, setExporting] = useState(false)
  const [lastExported, setLastExported] = useState<string | null>(null)

  useEffect(() => {
    if (sessionUser && sessionUser.role === 'campaign_admin') {
      router.replace('/dashboard/admin/campaign-dashboard')
      return
    }
    fetchAllData()
  }, [sessionUser, router])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      const [usersRes, campaignsRes, donationsRes, reportsRes, statsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/campaigns'),
        fetch('/api/admin/donation-reports'),
        fetch('/api/admin/reports'),
        fetch('/api/admin/export-stats'),
      ])
      const [usersData, campaignsData, donationsData, reportsData, statsData] = await Promise.all([
        usersRes.json(),
        campaignsRes.json(),
        donationsRes.json(),
        reportsRes.json(),
        statsRes.json(),
      ])
      setDbUsers(usersData.users ?? [])
      setDbCampaigns(campaignsData.campaigns ?? [])
      setDbDonations(donationsData.donations ?? [])
      setDbReports(reportsData.reports ?? [])
      setPlatformStats(statsData.stats ?? null)
    } catch {
      // silently fail — tables will show empty
    } finally {
      setLoading(false)
    }
  }

  const reportTypes = [
    {
      id: 'platform' as ReportType,
      title: 'Platform Summary',
      description: 'Overall platform statistics, KPIs, and top-level metrics.',
      icon: <BarChart3 className="h-6 w-6" />,
      rowCount: platformStats ? 13 : 0,
      color: 'text-blue-500',
    },
    {
      id: 'users' as ReportType,
      title: 'User Report',
      description: 'All registered users with roles, status, and join dates.',
      icon: <Users className="h-6 w-6" />,
      rowCount: dbUsers.length,
      color: 'text-purple-500',
    },
    {
      id: 'campaigns' as ReportType,
      title: 'Campaign Report',
      description: 'All campaigns with status, raised amounts, and donor counts.',
      icon: <FileText className="h-6 w-6" />,
      rowCount: dbCampaigns.length,
      color: 'text-green-500',
    },
    {
      id: 'donations' as ReportType,
      title: 'Donation Report',
      description: 'All donation transactions with amounts and donor information.',
      icon: <DollarSign className="h-6 w-6" />,
      rowCount: dbDonations.length,
      color: 'text-amber-500',
    },
    {
      id: 'reports' as ReportType,
      title: 'Flagged Content Report',
      description: 'All reported campaigns with resolution status.',
      icon: <Flag className="h-6 w-6" />,
      rowCount: dbReports.length,
      color: 'text-red-500',
    },
  ]

  function exportReport(type: ReportType, start: string, end: string) {
    const dateRange = `_${start || 'all'}_to_${end || 'all'}`
    switch (type) {
      case 'platform': {
        if (!platformStats) return
        const rows = [
          ['Total Users', platformStats.totalUsers],
          ['Active Users', platformStats.activeUsers],
          ['Suspended Users', platformStats.suspendedUsers],
          ['Frozen Users', platformStats.frozenUsers],
          ['Total Fund Raisers', platformStats.totalFundRaisers],
          ['Total Donees', platformStats.totalDonees],
          ['Total Campaigns', platformStats.totalCampaigns],
          ['Active Campaigns', platformStats.activeCampaigns],
          ['Completed Campaigns', platformStats.completedCampaigns],
          ['Draft Campaigns', platformStats.draftCampaigns],
          ['Total Donations', platformStats.totalDonations],
          ['Total Donation Amount ($)', platformStats.totalDonationAmount],
          ['Average Donation ($)', platformStats.averageDonation],
        ]
        downloadCSV(`platform_summary${dateRange}.csv`, ['Metric', 'Value'], rows as never)
        break
      }
      case 'users': {
        const filtered = filterByDate(dbUsers, start, end)
        const rows = filtered.map(u => [
          u.id, u.displayName, u.email, u.role, u.status,
          u.isVerified ? 'Yes' : 'No',
          u.location || '',
          new Date(u.createdAt).toLocaleDateString('en-AU'),
          u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-AU') : '',
        ])
        downloadCSV(`users_report${dateRange}.csv`,
          ['ID', 'Name', 'Email', 'Role', 'Status', 'Verified', 'Location', 'Joined', 'Last Login'],
          rows as never)
        break
      }
      case 'campaigns': {
        const filtered = filterByDate(dbCampaigns, start, end)
        const rows = filtered.map(c => [
          c.id, c.title, c.category, c.serviceType, c.status,
          c.targetAmount, c.raisedAmount, c.donorCount, c.views,
          c.organiserName,
          new Date(c.createdAt).toLocaleDateString('en-AU'),
          c.endDate || '',
          c.location || '',
        ])
        downloadCSV(`campaigns_report${dateRange}.csv`,
          ['ID', 'Title', 'Category', 'Service Type', 'Status', 'Target ($)', 'Raised ($)', 'Donors', 'Views', 'Organiser', 'Created', 'End Date', 'Location'],
          rows as never)
        break
      }
      case 'donations': {
        const filtered = filterByDate(dbDonations, start, end)
        const rows = filtered.map(d => [
          d.id, d.isAnonymous ? 'Anonymous' : d.donorName,
          d.campaignTitle, d.category, d.amount, d.status,
          d.isAnonymous ? 'Yes' : 'No',
          new Date(d.createdAt).toLocaleDateString('en-AU'),
        ])
        downloadCSV(`donations_report${dateRange}.csv`,
          ['ID', 'Donor', 'Campaign', 'Category', 'Amount ($)', 'Status', 'Anonymous', 'Date'],
          rows as never)
        break
      }
      case 'reports': {
        const filtered = filterByDate(dbReports, start, end)
        const rows = filtered.map(r => [
          r.id, r.campaignTitle, r.reporterName, r.reporterEmail,
          r.reason, r.status, r.resolvedBy || '', r.resolution || '',
          new Date(r.createdAt).toLocaleDateString('en-AU'),
        ])
        downloadCSV(`flagged_content_report${dateRange}.csv`,
          ['ID', 'Campaign', 'Reported By', 'Reporter Email', 'Reason', 'Status', 'Resolved By', 'Resolution', 'Date'],
          rows as never)
        break
      }
    }
  }

  const selectedConfig = reportTypes.find(r => r.id === selectedType)!

  const previewData = (() => {
    switch (selectedType) {
      case 'users':
        return {
          headers: ['Name', 'Email', 'Role', 'Status', 'Joined'],
          rows: dbUsers.slice(0, 5).map(u => [
            u.displayName, u.email, u.role, u.status,
            new Date(u.createdAt).toLocaleDateString('en-AU'),
          ])
        }
      case 'campaigns':
        return {
          headers: ['Title', 'Category', 'Status', 'Raised', 'Donors'],
          rows: dbCampaigns.slice(0, 5).map(c => [
            c.title.length > 35 ? c.title.slice(0, 35) + '...' : c.title,
            c.category, c.status,
            formatCurrency(c.raisedAmount),
            c.donorCount.toString(),
          ])
        }
      case 'donations':
        return {
          headers: ['Donor', 'Campaign', 'Amount', 'Status', 'Date'],
          rows: dbDonations.slice(0, 5).map(d => [
            d.isAnonymous ? 'Anonymous' : d.donorName,
            d.campaignTitle.length > 30 ? d.campaignTitle.slice(0, 30) + '...' : d.campaignTitle,
            formatCurrency(d.amount), d.status,
            new Date(d.createdAt).toLocaleDateString('en-AU'),
          ])
        }
      case 'reports':
        return {
          headers: ['Campaign', 'Reported By', 'Reason', 'Status', 'Date'],
          rows: dbReports.slice(0, 5).map(r => [
            r.campaignTitle.length > 30 ? r.campaignTitle.slice(0, 30) + '...' : r.campaignTitle,
            r.reporterName, r.reason, r.status,
            new Date(r.createdAt).toLocaleDateString('en-AU'),
          ])
        }
      default: // platform
        return {
          headers: ['Metric', 'Value'],
          rows: platformStats ? [
            ['Total Users', platformStats.totalUsers.toLocaleString()],
            ['Active Campaigns', platformStats.activeCampaigns.toLocaleString()],
            ['Total Donations', platformStats.totalDonations.toLocaleString()],
            ['Total Raised', formatCurrency(platformStats.totalDonationAmount)],
            ['Avg Donation', formatCurrency(platformStats.averageDonation)],
          ] : []
        }
    }
  })()

  const handleExport = async () => {
    setExporting(true)
    await new Promise(r => setTimeout(r, 400))
    exportReport(selectedType, startDate, endDate)
    setLastExported(new Date().toLocaleString('en-AU'))
    setExporting(false)
  }

  return (
    <DashboardLayout role="admin">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Export Reports</h1>
        <p className="text-muted-foreground">Generate and download platform reports as CSV files.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading data from database...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Report Selection & Options */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Report Type</CardTitle>
                <CardDescription>Choose the data to export</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {reportTypes.map(rt => (
                  <button
                    key={rt.id}
                    onClick={() => setSelectedType(rt.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3 ${
                      selectedType === rt.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/40 hover:bg-muted/50'
                    }`}
                  >
                    <span className={`mt-0.5 ${rt.color}`}>{rt.icon}</span>
                    <div>
                      <p className="font-medium text-sm">{rt.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{rt.description}</p>
                      <Badge variant="secondary" className="mt-1 text-xs">{rt.rowCount} rows</Badge>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date Range
                </CardTitle>
                <CardDescription>Filter by creation date (optional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="startDate" className="text-sm">From</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="endDate" className="text-sm">To</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs w-full"
                  onClick={() => { setStartDate(""); setEndDate("") }}
                >
                  Clear dates
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Preview and Export */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className={selectedConfig.color}>{selectedConfig.icon}</span>
                  {selectedConfig.title}
                </CardTitle>
                <CardDescription>{selectedConfig.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{selectedConfig.rowCount}</p>
                    <p className="text-muted-foreground">Records</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">CSV</p>
                    <p className="text-muted-foreground">Format</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{previewData.headers.length}</p>
                    <p className="text-muted-foreground">Columns</p>
                  </div>
                </div>

                <Separator />

                {lastExported && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Last exported: {lastExported}
                  </div>
                )}

                <Button
                  onClick={handleExport}
                  disabled={exporting}
                  className="w-full"
                  size="lg"
                >
                  {exporting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2" />
                      Download CSV
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Data Preview</CardTitle>
                <CardDescription>First 5 rows of the selected report (live from database)</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {previewData.headers.map(h => (
                          <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={previewData.headers.length} className="text-center text-muted-foreground text-sm py-6">
                            No records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        previewData.rows.map((row, i) => (
                          <TableRow key={i}>
                            {row.map((cell, j) => (
                              <TableCell key={j} className="text-xs py-2 max-w-[150px]">
                                <span className="truncate block">{cell}</span>
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground px-4 py-3 border-t border-border">
                  Preview shows first 5 rows. The exported file will contain all {selectedConfig.rowCount} records.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Exports</CardTitle>
                <CardDescription>Export any report instantly</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {reportTypes.map(rt => (
                  <Button
                    key={rt.id}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    onClick={() => exportReport(rt.id, startDate, endDate)}
                  >
                    <span className={rt.color}>{rt.icon}</span>
                    <span className="text-xs">{rt.title}</span>
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
