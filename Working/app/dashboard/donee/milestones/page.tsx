"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Award,
  Target,
  DollarSign,
  CalendarDays,
  Loader2,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
} from "lucide-react"
import { DashboardLayout } from "@/components/layout/dashboard-sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useAuth } from "@/components/providers/session-provider"

type CampaignActivity = {
  id: string
  title: string
  summary?: string | null
  category: string
  status: string
  targetAmount: number
  raisedAmount: number
  donorCount?: number
  startDate: string
  endDate: string
  coverImage?: string | null
  progress: number
  reachedMilestones: number[]
  nextMilestone: number | null
}

type LinkedCampaign = {
  id: string
  title: string
  summary?: string | null
  category: string
  status: string
  targetAmount: number
  raisedAmount: number
  donorCount?: number
  startDate: string
  endDate: string
  coverImage?: string | null
}

type DoneeDashboardResponse = {
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

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function getProgress(raisedAmount: number, targetAmount: number) {
  if (!targetAmount || targetAmount <= 0) return 0
  return Math.min(100, Math.round((raisedAmount / targetAmount) * 100))
}

function getReachedMilestones(progress: number) {
  return [25, 50, 75, 100].filter((milestone) => progress >= milestone)
}

function getNextMilestone(progress: number) {
  return [25, 50, 75, 100].find((milestone) => progress < milestone) ?? null
}

export default function DoneeMilestonesPage() {
  const { user } = useAuth()

  const [activities, setActivities] = useState<CampaignActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

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
          throw new Error("Failed to load milestone data.")
        }

        return response.json()
      })
      .then((data: DoneeDashboardResponse) => {
        if (!isMounted) return

        const mappedActivities = (data.linkedCampaigns ?? [])
          .filter((campaign) => campaign.title !== REMOVED_CAMPAIGN_TITLE)
          .map((campaign) => {
            const progress = getProgress(
              campaign.raisedAmount,
              campaign.targetAmount
            )

            return {
              ...campaign,
              progress,
              reachedMilestones: getReachedMilestones(progress),
              nextMilestone: getNextMilestone(progress),
            }
          })

        setActivities(mappedActivities)
      })
      .catch(() => {
        if (!isMounted) return
        setError("Unable to load milestone progress alerts. Please try again.")
        setActivities([])
      })
      .finally(() => {
        if (!isMounted) return
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const milestoneAlerts = activities.filter(
    (activity) => activity.reachedMilestones.length > 0
  )

  return (
    <DashboardLayout role="donee" user={sidebarUser}>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
          Milestone Progress Alerts
        </h1>
        <p className="text-muted-foreground">
          View milestone alerts when fundraising activities linked to you reach
          25%, 50%, 75%, or 100% of their goal.
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
              Failed to load milestones
            </h3>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="p-5">
                <Award className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">{milestoneAlerts.length}</p>
                <p className="text-sm text-muted-foreground">
                  Activities With Milestones
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <CheckCircle2 className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">
                  {activities.reduce(
                    (sum, activity) => sum + activity.reachedMilestones.length,
                    0
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  Milestones Reached
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <Target className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">{activities.length}</p>
                <p className="text-sm text-muted-foreground">
                  Linked Activities
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <DollarSign className="h-5 w-5 text-primary mb-3" />
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    activities.reduce(
                      (sum, activity) => sum + activity.raisedAmount,
                      0
                    )
                  )}
                </p>
                <p className="text-sm text-muted-foreground">Total Raised</p>
              </CardContent>
            </Card>
          </div>

          {activities.length > 0 ? (
            <div className="space-y-5">
              {activities.map((activity) => (
                <Card key={activity.id}>
                  <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <Badge variant="outline">{activity.category}</Badge>
                          <Badge
                            variant={
                              activity.status === "active"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {activity.status}
                          </Badge>
                        </div>

                        <CardTitle className="text-lg">
                          {activity.title}
                        </CardTitle>

                        <p className="text-sm text-muted-foreground mt-2">
                          {activity.summary || "No summary provided."}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">
                          {activity.progress}%
                        </p>
                        <p className="text-xs text-muted-foreground">funded</p>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="mb-5">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-muted-foreground">
                          Fundraising Progress
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(activity.raisedAmount)} /{" "}
                          {formatCurrency(activity.targetAmount)}
                        </span>
                      </div>

                      <Progress value={activity.progress} className="h-2" />
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-5">
                      {[25, 50, 75, 100].map((milestone) => {
                        const reached =
                          activity.reachedMilestones.includes(milestone)

                        return (
                          <div
                            key={milestone}
                            className={`rounded-lg border p-3 text-center ${
                              reached
                                ? "bg-primary/10 border-primary/40"
                                : "bg-muted/40"
                            }`}
                          >
                            <div className="flex justify-center mb-1">
                              {reached ? (
                                <CheckCircle2 className="h-5 w-5 text-primary" />
                              ) : (
                                <Award className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <p className="text-sm font-semibold">
                              {milestone}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {reached ? "Reached" : "Pending"}
                            </p>
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        {formatDate(activity.startDate)} -{" "}
                        {formatDate(activity.endDate)}
                      </div>

                      <div className="flex gap-2">
                        {activity.nextMilestone ? (
                          <Badge variant="secondary">
                            Next milestone: {activity.nextMilestone}%
                          </Badge>
                        ) : (
                          <Badge>Goal completed</Badge>
                        )}

                        <Link
                          href={`/dashboard/donee/activities?activityId=${activity.id}`}
                        >
                          <Button variant="outline" size="sm">
                            View Activity
                            <ArrowRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <Award className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">
                  No milestone alerts yet
                </h3>
                <p className="text-muted-foreground">
                  Milestone alerts will appear when linked fundraising
                  activities reach 25%, 50%, 75%, or 100% of their goal.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </DashboardLayout>
  )
}
