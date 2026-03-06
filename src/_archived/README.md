# Archived Features

This folder contains archived features that have been temporarily removed from the active codebase. These files are preserved for future restoration.

## Archived Date: March 2026

## Contents

### Pages (`pages/`)
- **Pipeline.tsx** - Deal pipeline management page
- **Revenue.tsx** - Revenue tracking and analytics
- **QuickQuotePage.tsx** - Quick quote calculator page
- **CopyBankPage.tsx** - Copy snippets management
- **BrandLibrary.tsx** - Brand library management
- **TemplatesPage.tsx** - Deal templates page

### Components (`components/`)
- **DealIntake.tsx** - Deal intake form
- **DealTracker.tsx** - Deal tracking component
- **DealDetailDrawer.tsx** - Deal detail side drawer
- **IntegratedDealFlow.tsx** - Integrated deal workflow
- **DealContract.tsx** - Contract generation
- **DealInvoice.tsx** - Invoice generation
- **DealPerformanceReport.tsx** - Deal performance reports
- **DealProductionChecklist.tsx** - Production checklist
- **DealTemplates.tsx** - Deal templates management
- **DealFitCheck.tsx** - Deal fit assessment
- **KanbanBoard.tsx** - Kanban view for deals
- **TimelineView.tsx** - Timeline view for deals
- **GalleryView.tsx** - Gallery view for deals
- **QuickQuoteCalculator.tsx** - Quote calculator
- **CopyBank.tsx** - Copy snippets bank
- **BrandFitCheck.tsx** - Brand fit assessment
- **DueCompletenessWidget.tsx** - Due completeness tracker
- **DueDetailsForm.tsx** - Due details form
- **ReportGenerator.tsx** - Report generation
- **SharedCampaignView.tsx** - Shared campaign view
- **FollowUpWidget.tsx** - Follow-up tracking widget
- **FinancialTools.tsx** - Financial tools component
- **ScopeRecapGenerator.tsx** - Scope recap generator

### Components/DailyPulse (`components/DailyPulse/`)
- **DealPipelineCard.tsx** - Deal pipeline card for Daily Pulse

### Utilities (`lib/`)
- **dealToSchedule.ts** - Deal to schedule conversion utilities

## Restoration

To restore these features:

1. Move the desired files back to their original locations in `src/`
2. Re-add the corresponding routes in `App.tsx`
3. Re-add navigation items in `Layout.tsx`
4. Update any imports in other components

## Database

All deal-related database tables remain intact:
- `deals`
- `revenue_records`
- `copy_snippets`
- `deal_templates`
- `follow_up_records`
- `brand_prospects`

No database migrations are needed for restoration.
