"use client"

import { useState, useMemo, useEffect } from "react"
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  Search,
  Filter,
  DollarSign,
  User,
  Calendar,
  ShieldAlert,
  Lock,
  Unlock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { DashboardLayout } from "@/components/layout/dashboard-sidebar"
import { StatsCard } from "@/components/ui/stats-card"
import { useAuth } from "@/components/providers/session-provider"
import type { CampaignReview, ReviewStatus } from "@/lib/types"

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending_review: { label: 'Pending Review', variant: 'secondary' },
  under_review: { label: 'Under Review', variant: 'default' },
  approved: { label: 'Approved', variant: 'default' },
  active: { label: 'Approved (Live)', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  on_hold: { label: 'On Hold', variant: 'destructive' },
  locked: { label: 'Locked', variant: 'destructive' },
  draft: { label: 'Draft', variant: 'outline' },
  completed: { label: 'Completed', variant: 'outline' },
}

export default function CampaignReviewPage() {
  const { user: sessionUser } = useAuth()
  const [reviews, setReviews] = useState<CampaignReview[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedReview, setSelectedReview] = useState<CampaignReview | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [actionType, setActionType] = useState<string>("")
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [reviewNotes, setReviewNotes] = useState("")
  const [lockDialogOpen, setLockDialogOpen] = useState(false)
  const [lockTarget, setLockTarget] = useState<CampaignReview | null>(null)
  const [lockReason, setLockReason] = useState("")
  const [isLocking, setIsLocking] = useState(false)
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false)
  const [unlockTarget, setUnlockTarget] = useState<CampaignReview | null>(null)
  const [isUnlocking, setIsUnlocking] = useState(false)

  useEffect(() => {
    fetch('/api/admin/campaigns')
      .then((r) => r.json())
      .then((data) => setReviews(data.campaigns ?? []))
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  const stats = useMemo(() => ({
    pending: reviews.filter(r => r.status === 'pending_review').length,
    underReview: reviews.filter(r => r.status === 'under_review').length,
    approved: reviews.filter(r => r.status === 'approved').length,
    onHold: reviews.filter(r => r.status === 'on_hold' || r.status === 'rejected').length,
  }), [reviews])

  const filtered = useMemo(() => reviews.filter(r => {
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter
    const matchesSearch =
      r.campaignTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.organiserName.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  }), [reviews, statusFilter, searchQuery])

  const handleAction = (review: CampaignReview, action: string) => {
    setSelectedReview(review)
    setActionType(action)
    setReviewNotes(review.notes ?? "")
    setActionDialogOpen(true)
  }

  const confirmAction = async () => {
    if (!selectedReview) return
    const newStatus: ReviewStatus =
      actionType === 'approve' ? 'approved' :
      actionType === 'reject' ? 'rejected' :
      actionType === 'under_review' ? 'under_review' :
      'on_hold'

    await fetch('/api/admin/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: selectedReview.campaignId, status: newStatus }),
    })

    setReviews((prev) =>
      prev.map((r) =>
        r.id === selectedReview.id
          ? { ...r, status: newStatus, notes: reviewNotes, reviewedAt: new Date().toISOString() }
          : r
      )
    )
    setActionDialogOpen(false)
    setShowDetail(false)
    setSelectedReview(null)
    setReviewNotes("")
  }

  const handleLock = (review: CampaignReview) => {
    setLockTarget(review)
    setLockReason("")
    setLockDialogOpen(true)
  }

  const confirmLock = async () => {
    if (!lockTarget || !lockReason.trim()) return
    setIsLocking(true)
    await fetch('/api/admin/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: lockTarget.campaignId, status: 'locked' }),
    })
    setReviews((prev) =>
      prev.map((r) =>
        r.id === lockTarget.id ? { ...r, status: 'locked' as unknown as ReviewStatus } : r
      )
    )
    setIsLocking(false)
    setLockDialogOpen(false)
    setLockTarget(null)
    setLockReason("")
  }

  const handleUnlock = (review: CampaignReview) => {
    setUnlockTarget(review)
    setUnlockDialogOpen(true)
  }

  const confirmUnlock = async () => {
    if (!unlockTarget) return
    setIsUnlocking(true)
    await fetch('/api/admin/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: unlockTarget.campaignId, status: 'active' }),
    })
    setReviews((prev) =>
      prev.map((r) =>
        r.id === unlockTarget.id ? { ...r, status: 'active' as unknown as ReviewStatus } : r
      )
    )
    setIsUnlocking(false)
    setUnlockDialogOpen(false)
    setUnlockTarget(null)
  }

  const getActionDialogContent = () => {
    switch (actionType) {
      case 'approve':
        return {
          title: 'Approve Campaign?',
          description: 'This campaign will be approved and the organiser will be notified to publish it.',
          buttonLabel: 'Approve',
          danger: false,
        }
      case 'reject':
        return {
          title: 'Reject Campaign?',
          description: 'This campaign will be rejected. Please provide rejection notes for the organiser.',
          buttonLabel: 'Reject',
          danger: true,
        }
      case 'under_review':
        return {
          title: 'Mark as Under Review?',
          description: 'This campaign will be marked as under review while you investigate further.',
          buttonLabel: 'Mark Under Review',
          danger: false,
        }
      case 'on_hold':
        return {
          title: 'Place Campaign On Hold?',
          description: 'This will temporarily suspend the campaign review pending further investigation (SA-UC08).',
          buttonLabel: 'Place On Hold',
          danger: true,
        }
      default:
        return { title: '', description: '', buttonLabel: 'Confirm', danger: false }
    }
  }

  const dialogContent = getActionDialogContent()

  const sidebarUser = sessionUser
    ? { name: `${sessionUser.firstName} ${sessionUser.lastName}`, email: sessionUser.email, role: sessionUser.role }
    : undefined

  return (
    <DashboardLayout
      role={(sessionUser?.role as import('@/lib/types').UserRole) ?? 'admin'}
      user={sidebarUser}
    >
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Campaign Review</h1>
        <p className="text-muted-foreground">Review, approve, reject, or place campaigns under temporary hold.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard title="Pending Review" value={stats.pending.toString()} icon={<Clock className="h-5 w-5" />} description="Awaiting action" />
        <StatsCard title="Under Review" value={stats.underReview.toString()} icon={<Eye className="h-5 w-5" />} description="Being investigated" />
        <StatsCard title="Approved" value={stats.approved.toString()} icon={<CheckCircle className="h-5 w-5" />} description="Cleared to publish" />
        <StatsCard title="Held / Rejected" value={stats.onHold.toString()} icon={<ShieldAlert className="h-5 w-5" />} description="Action taken" />
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by campaign title or organiser..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Campaign Review Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground">Loading campaigns...</div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Organiser</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(review => {
                const sc = statusConfig[review.status ] ?? { label: review.status, variant: 'secondary' as const }
                return (
                  <TableRow key={review.id}>
                    <TableCell className="font-medium max-w-[200px]">
                      <p className="truncate">{review.campaignTitle}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1">
                        {review.isOrganiserVerified && (
                          <Badge variant="outline" className="text-xs px-1 py-0">✓</Badge>
                        )}
                        {review.organiserName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{review.campaignCategory}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatCurrency(review.targetAmount)}</TableCell>
                    <TableCell>
                      <Badge variant={sc.variant} className="text-xs">{sc.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(review.submittedAt).toLocaleDateString('en-AU')}
                    </TableCell>
                    <TableCell>
                      {(review.flaggedIssues?.length ?? 0) > 0 && (
                        <Badge variant="destructive" className="gap-1 text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          {review.flaggedIssues!.length}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setSelectedReview(review); setShowDetail(true) }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(review.status === 'pending_review' || review.status === 'under_review') && (
                          <>
                            <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handleAction(review, 'approve')}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-amber-500" onClick={() => handleAction(review, 'on_hold')}>
                              <Clock className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleAction(review, 'reject')}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {(review.status as string) === 'active' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            title="Lock campaign (fraud prevention)"
                            onClick={() => handleLock(review)}
                          >
                            <Lock className="h-4 w-4" />
                          </Button>
                        )}
                        {(review.status as string) === 'locked' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-green-600"
                            title="Unlock campaign"
                            onClick={() => handleUnlock(review)}
                          >
                            <Unlock className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No campaigns match the selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {/* Campaign Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Campaign Review Details</DialogTitle>
            <DialogDescription>Review the campaign before approving or rejecting.</DialogDescription>
          </DialogHeader>
          {selectedReview && (
            <div className="space-y-5">
              <img
                src={selectedReview.coverImage}
                alt={selectedReview.campaignTitle}
                className="w-full h-48 object-cover rounded-lg"
              />

              <div>
                <h3 className="font-semibold text-lg">{selectedReview.campaignTitle}</h3>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary">{selectedReview.campaignCategory}</Badge>
                  <Badge variant={(statusConfig[selectedReview.status ] ?? { variant: 'secondary' }).variant}>
                    {(statusConfig[selectedReview.status ] ?? { label: selectedReview.status }).label}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Organiser</p>
                    <p className="font-medium">
                      {selectedReview.organiserName}
                      {selectedReview.isOrganiserVerified && <span className="text-green-600 ml-1">✓</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedReview.organiserEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Target Amount</p>
                    <p className="font-medium">{formatCurrency(selectedReview.targetAmount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Submitted</p>
                    <p className="font-medium">{new Date(selectedReview.submittedAt).toLocaleDateString('en-AU')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Service Type</p>
                    <p className="font-medium capitalize">{selectedReview.campaignServiceType}</p>
                  </div>
                </div>
              </div>

              {(selectedReview.flaggedIssues?.length ?? 0) > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium text-destructive flex items-center gap-1 mb-2">
                      <AlertTriangle className="h-4 w-4" /> Flagged Issues
                    </p>
                    <ul className="space-y-1">
                      {selectedReview.flaggedIssues!.map((issue, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {selectedReview.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-1">Review Notes</p>
                    <p className="text-sm text-muted-foreground">{selectedReview.notes}</p>
                  </div>
                </>
              )}

              {(selectedReview.status === 'pending_review' || selectedReview.status === 'under_review') && (
                <>
                  <Separator />
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => { setShowDetail(false); handleAction(selectedReview, 'approve') }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setShowDetail(false); handleAction(selectedReview, 'under_review') }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Mark Under Review
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-600 border-amber-300"
                      onClick={() => { setShowDetail(false); handleAction(selectedReview, 'on_hold') }}
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Place On Hold
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => { setShowDetail(false); handleAction(selectedReview, 'reject') }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Dialog */}
      <AlertDialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogContent.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogContent.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label htmlFor="notes" className="text-sm">Notes for organiser (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add a note that will be shared with the campaign organiser..."
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              className="mt-1.5 text-sm"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              className={dialogContent.danger ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {dialogContent.buttonLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unlock Campaign Dialog */}
      <AlertDialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlock className="h-5 w-5 text-green-600" />
              Unlock Campaign?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{unlockTarget?.campaignTitle}</strong> will be set back to active and will
              resume accepting donations immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnlocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnlock}
              disabled={isUnlocking}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {isUnlocking ? 'Unlocking...' : 'Unlock Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lock Campaign Dialog */}
      <AlertDialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-destructive" />
              Lock Campaign?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{lockTarget?.campaignTitle}</strong> will be locked immediately. It will no longer accept donations
              and will be marked as locked in all views. This action cannot be automatically reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Label htmlFor="lockReason" className="text-sm">
              Reason for locking <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="lockReason"
              placeholder="Describe the fraud concern or reason for locking this campaign..."
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              className="mt-1.5 text-sm"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLock}
              disabled={!lockReason.trim() || isLocking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLocking ? 'Locking...' : 'Lock Campaign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  )
}
