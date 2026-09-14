# Cursor Build Instruction — Hydrogenera Sales Prospecting & Contacting Strategy Page

## 1. Purpose

Build a new page in the existing Hydrogenera sales tracking application dedicated to **lead procurement, prospecting, contacting strategy, and pre-project qualification**.

This page should sit **before** the existing project-specific Sales Tracking page in the sales workflow.

The new page is not intended to duplicate project management. Its role is to help the sales team:

- continuously build a pipeline of potential clients;
- prepare and organize contacts before outreach;
- track outreach attempts and follow-ups;
- categorize prospects by market, source, priority, and engagement state;
- monitor weekly and monthly prospecting targets;
- identify which prospects are becoming real opportunities;
- promote qualified prospects into the existing Sales Tracking system.

The current Sales Tracking page is project-specific and already categorizes projects broadly as:
- Cold
- Hot
- Under Development
- Commissioned

These categories can remain for now. The application should be designed so additional stages such as **Warm** can be added later without major restructuring.

---

# 2. Core Sales Strategy to Implement

Hydrogenera currently has long B2B sales cycles, often around 6–12 months, and a low conversion rate from initial lead to signed contract.

The strategy should therefore optimize for **pipeline volume and disciplined follow-up**, not only individual wins.

The target prospecting activity is:

- **80 new individual contacts per month**
- **20 new individual contacts per week**

Weekly operating rhythm:

### Monday
Prepare 10 new contacts for Tuesday outreach.

Tasks:
- identify target companies;
- identify specific sites/plants where possible;
- identify appropriate decision-makers;
- determine which Hydrogenera product/application is relevant;
- understand the likely client problem or opportunity;
- define the reason for contacting them;
- prepare contact details and outreach strategy.

### Tuesday
Contact the 10 prepared prospects.

Also perform scheduled follow-ups with older prospects.

### Wednesday
Prepare another 10 new contacts for Thursday outreach.

Also research:
- public tenders;
- funding calls;
- hydrogen projects;
- hydrogen valleys;
- plant modernization projects;
- industrial decarbonization announcements;
- new production facilities;
- energy-efficiency projects;
- EPC/consultant opportunities.

### Thursday
Contact the second set of 10 new prospects.

Also perform all due follow-ups.

### Friday
Pipeline and performance review.

Review:
- new contacts;
- replies;
- positive replies;
- meetings;
- qualified opportunities;
- offers generated;
- overdue follow-ups;
- prospects with no recent activity;
- hot opportunities;
- reasons for lost leads;
- next-week priorities.

Important rule:

**Follow-ups do not count toward the target of 80 new contacts per month.**

The 80-contact KPI refers to **new individual people contacted**.

A single company may therefore contain several contacts.

---

# 3. Prospecting Page Position in the Sales Workflow

The sales flow should conceptually be:

Target Company  
→ Contact Identified  
→ Contact Prepared  
→ Contacted  
→ Follow-Up  
→ Engaged  
→ Qualified  
→ Promoted to Sales Project  
→ Existing Sales Tracking workflow

The new page should own everything from initial research up to qualification.

The existing Sales Tracking page should own the prospect once it becomes a real project/opportunity.

Do not create two independent copies of the same prospect/project.

When a prospect is promoted, the system should either:
1. create a new linked Sales Project record; or
2. attach the prospect to an existing Sales Project.

The original prospecting history must remain available after promotion.

---

# 4. Hydrogenera Market Categories

Every prospect must be assigned to one primary market/application.

Use the following initial categories.

## A. CNG Burning Optimisation
Product:
- **E-Series**
- H2 purity baseline: **99.9%**

Typical targets:
- industrial furnaces;
- dryers;
- boilers;
- ovens;
- heat-treatment equipment;
- ceramics;
- glass;
- food processing;
- automotive drying/paint lines;
- mineral processing;
- other large natural-gas consumers.

Typical sales objective:
Reduce fossil fuel consumption / improve combustion efficiency / lower operating cost / reduce CO2.

Typical target roles:
- Plant Manager
- Technical Director
- Energy Manager
- Production Director
- Process Engineer
- Engineering Director
- Sustainability / Decarbonisation Manager

---

## B. Cement Plant Optimisation
Product:
- **E-Series**
- H2 purity baseline: **99.9%**

Typical targets:
- cement plants;
- clinker production plants;
- lime plants;
- rotary-kiln applications.

Typical sales objective:
Improve combustion performance and potentially reduce fossil-fuel consumption using locally produced hydrogen and oxygen.

Typical target roles:
- Plant Director
- Kiln Manager
- Process Director
- Energy Manager
- Alternative Fuels Manager
- Technical Director
- Group Decarbonisation / Sustainability Director

This must remain a separate market category from general CNG optimization because the sales process, technical discussion, and decision-makers can differ significantly.

---

## C. Power Plant Generator Cooling with Hydrogen
Product:
- **Z-Series**
- H2 purity baseline: **99.999%**

Typical targets:
- thermal power plants;
- nuclear power plants;
- gas power plants;
- facilities with hydrogen-cooled turbine generators;
- sites using old on-site electrolysers;
- sites using bottled or trucked hydrogen;
- plants planning generator modernization.

Typical sales objective:
Provide high-purity on-site hydrogen production for generator cooling.

Typical target roles:
- Plant Director
- Chief Engineer
- Maintenance Manager
- Generator / Turbine Engineer
- Technical Procurement
- Power Plant Modernisation Team
- Engineering Department

Useful trigger events:
- old electrolyser replacement;
- generator overhaul;
- modernization tender;
- reliability problems;
- high cylinder/logistics costs;
- purity or supply-security issues.

---

## D. Clean Hydrogen Production for Existing Industrial H2 Users
Product:
- **Z-Series**
- H2 purity baseline: **99.999%**

Targets should preferably already consume hydrogen.

Possible sectors:
- chemical production;
- metallurgy;
- heat treatment;
- electronics;
- specialty materials;
- hydrogenation processes;
- glass;
- industrial gas users;
- laboratories / research facilities;
- other manufacturing processes requiring hydrogen.

Typical sales objective:
Replace or reduce purchased hydrogen through on-site hydrogen production.

Important principle:
Prioritize companies with a real existing hydrogen requirement rather than attempting to create hydrogen demand where none currently exists.

---

## E. Clean H2 Production for Sale / Hydrogen Valleys / H2 Infrastructure
Product:
- **Z-Series**
- H2 purity baseline: **99.999%**

Typical targets:
- hydrogen project developers;
- energy companies;
- renewable developers;
- utilities;
- municipalities;
- ports;
- transport projects;
- industrial parks;
- hydrogen valleys;
- EPC contractors;
- infrastructure developers;
- hydrogen distributors;
- investment-led H2 projects.

Typical sales objective:
Supply the electrolyser and integrated hydrogen-production solution for a wider hydrogen project.

This category often has a longer development cycle because projects may depend on:
- funding;
- consortium creation;
- renewable electricity;
- permitting;
- hydrogen offtake;
- infrastructure;
- financing;
- public procurement.

---

# 5. Initial Allocation of Prospecting Effort

The page should support target allocation by market.

Use these default monthly shares initially:

- CNG Burning Optimisation: **30%**
- Cement Plant Optimisation: **25%**
- Power Plant Generator Cooling: **20%**
- Existing Industrial H2 Users: **15%**
- Hydrogen Production / Hydrogen Valleys: **10%**

These percentages must be editable in the future.

The purpose is to compare:
- planned effort;
- actual contacts;
- engagement;
- qualified opportunities;
- project conversion;

and later adjust the strategy based on real results.

---

# 6. Lead Source Categories

Each prospect/contact should have a source.

Initial source categories:

- Cold Outreach
- Existing Personal Contact
- Referral
- Existing Client / Cross-Sell
- Public Tender
- Public Procurement
- Funding Call
- EU Project / Consortium
- Hydrogen Valley
- Project Announcement
- EPC / Engineering Partner
- Consultant
- Distributor / Sales Partner
- Conference / Event
- Website Inquiry
- LinkedIn
- Other

The strategy should not rely only on cold outreach.

The page should make it easy to measure which sources create the highest number of:
- replies;
- meetings;
- qualified opportunities;
- offers;
- contracts.

---

# 7. Prospect / Contact Statuses

Use simple pre-project statuses.

Recommended initial statuses:

1. **Target Identified**
   - Company is interesting but no person has been selected yet.

2. **Contact Prepared**
   - Decision-maker/contact identified.
   - Contact information available.
   - Outreach strategy prepared.
   - Ready for next outreach day.

3. **Contacted**
   - Initial outreach has been sent/made.

4. **Follow-Up Due**
   - Initial contact made but next follow-up is required.

5. **Engaged**
   - Prospect has replied or meaningful two-way communication has started.

6. **Qualified**
   - There is a real potential project/opportunity worth moving into Sales Tracking.

7. **Promoted to Sales Project**
   - Prospect has been converted/linked into the existing Sales Tracking page.

8. **Not Interested**
   - Prospect explicitly rejected the opportunity.

9. **No Response / Dormant**
   - Multiple attempts made without meaningful response.

10. **Disqualified**
   - Company/contact does not fit Hydrogenera's target market or project requirements.

Statuses should be configurable later.

Do not hard-code the UI in a way that makes adding "Warm", "Nurture", etc. difficult.

---

# 8. Contact-Level vs Company-Level Structure

The system should distinguish between:

## Company / Account
Represents the organization or specific plant/site.

Fields should include:
- Company name
- Country
- City / Location
- Plant / Site name
- Website
- Industry
- Market category
- Company notes
- Estimated opportunity potential
- Existing Hydrogenera relationship
- Source
- Priority
- Owner
- Date added
- Last activity
- Next action
- Number of contacts
- Linked Sales Project, if promoted

## Contact
Represents an individual person.

Fields:
- Full name
- Job title
- Department
- Company
- Email
- Phone
- LinkedIn URL
- Preferred contact method
- Contact source
- Contact status
- Date prepared
- Date first contacted
- Last contacted
- Next follow-up date
- Number of outreach attempts
- Response status
- Notes
- Owner
- Primary / secondary contact flag

Important:

**One company can and often should have multiple contacts.**

For important prospects, the sales team should be encouraged to identify 2–4 relevant stakeholders.

Example for a cement plant:
- Plant Director
- Process Director
- Energy Manager
- Sustainability Manager

The page should support this "multi-threaded" sales approach.

---

# 9. Qualification Information

When a prospect becomes engaged, allow the salesperson to record basic qualification information before promoting it to Sales Tracking.

Suggested qualification fields:

- Is there an identifiable project or problem?
- Relevant Hydrogenera market/application
- Relevant product: E-Series / Z-Series
- Existing fuel or H2 use
- Approximate energy/H2 requirement if known
- Existing equipment/system if known
- Pain point / client objective
- Project timing
- Budget known? Yes / No / Unknown
- Funding needed? Yes / No / Unknown
- Decision-maker identified? Yes / No
- Technical contact identified? Yes / No
- Client requested:
  - meeting
  - technical call
  - questionnaire
  - calculation
  - business case
  - budgetary offer
  - formal offer
  - site visit
  - other
- Estimated project value
- Probability / confidence
- Qualification notes

A prospect does not need every field completed to become qualified.

Keep qualification lightweight.

---

# 10. Promotion to Existing Sales Tracking

Create a clear action:

**Promote to Sales Project**

When clicked:

1. Confirm which company/contact is being promoted.
2. Allow user to enter/select:
   - project name;
   - project owner;
   - initial Sales Tracking category;
   - estimated value;
   - market/application;
   - short project description.
3. Create the Sales Project record.
4. Link the originating prospect/company/contact to the project.
5. Preserve:
   - outreach history;
   - notes;
   - source;
   - contacts;
   - qualification data.
6. Mark the prospect as:
   **Promoted to Sales Project**

Initial mapping can be:

- Qualified prospect with no offer yet → **Cold** Sales Project
- Offer issued / active project discussion → **Hot** Sales Project
- Contracted / engineering activity → **Under Development**
- Installed / completed → **Commissioned**

Do not force this mapping if the existing system already has its own logic.

Instead, reuse the existing project category/status implementation where possible.

---

# 11. Main Page UX

The page must be simple, fast, and suitable for daily use.

Suggested page name:

**Prospecting**

Alternative:
**Sales Prospecting**
or
**Lead Generation**

Recommended layout:

---

## A. Top Summary Bar

Display compact KPI cards:

- New Contacts This Week / 20
- New Contacts This Month / 80
- Contacts Prepared
- Follow-Ups Due
- Engaged Prospects
- Qualified Prospects
- Promoted This Month
- Overdue Follow-Ups

Use simple visual progress indicators for:
- weekly target;
- monthly target.

Example:
**14 / 20 contacts this week**
**53 / 80 contacts this month**

Avoid oversized dashboard elements.

---

## B. Weekly Action Section

Display the sales rhythm for the current week.

Example:

### Monday
Prepare 10 contacts

Progress:
6 / 10 prepared

### Tuesday
Contact prepared list

Progress:
8 / 10 contacted

### Wednesday
Prepare 10 contacts

### Thursday
Contact prepared list

### Friday
Review pipeline

This section should automatically use the current day/week.

It should help users immediately understand:
**What am I supposed to do today?**

---

## C. Main Prospecting Work Table

This should be the primary daily working area.

Recommended columns:

- Select checkbox
- Company
- Contact
- Job Title
- Country
- Market
- Product
- Source
- Status
- Priority
- Owner
- Last Activity
- Next Action
- Follow-Up Date
- Outreach Attempts
- Project Potential
- Actions

Actions:
- View
- Edit
- Log Contact
- Schedule Follow-Up
- Mark Engaged
- Qualify
- Promote to Project

Support inline editing for simple fields when practical.

---

# 12. Views / Tabs

Keep the page easy to understand.

Recommended tabs/views:

### 1. My Work
Shows records owned by current user needing action:
- contact preparation;
- outreach;
- follow-up;
- qualification.

### 2. Prepare
Shows:
- Target Identified
- Contact Prepared

Optimized for Monday/Wednesday research.

### 3. Contact
Shows:
- Contact Prepared
- Contacted
- Follow-Up Due

Optimized for Tuesday/Thursday outreach.

### 4. Engaged
Shows:
- Engaged
- Qualified

This is the pre-project conversion queue.

### 5. All Prospects
Full searchable database.

### 6. Sources / Opportunities
Optional view for non-company-specific opportunities such as:
- tender;
- funding call;
- consortium;
- hydrogen valley;
- public project;
- EPC partner opportunity.

If a funding/tender opportunity later becomes an actual client/project, it can be connected to one or more companies.

---

# 13. Filters and Search

Support fast filtering by:

- Owner
- Country
- Market
- Product
- Source
- Status
- Priority
- Company
- Contact
- Date added
- Follow-up due
- Engaged / not engaged
- Promoted / not promoted

Quick filters:
- Due Today
- Overdue
- This Week
- Prepared for Outreach
- No Activity > 14 Days
- No Activity > 30 Days
- High Priority
- Qualified
- Unassigned

Add free-text search.

---

# 14. Priority

Use a simple priority field:

- High
- Medium
- Low

Optionally support a numeric score later.

Initial priority can be based manually on:
- project size;
- fit with Hydrogenera;
- active client need;
- timing;
- accessibility of decision-maker;
- strategic importance.

Avoid creating a complex scoring model in the first version.

---

# 15. Contacting / Outreach Log

Every interaction should be logged.

Interaction types:
- Email
- Phone
- LinkedIn
- Meeting
- Video Call
- In-Person Meeting
- Referral
- Tender Submission
- Other

Interaction fields:
- Date/time
- Contact
- Company
- User
- Type
- Summary
- Result
- Next action
- Next action date
- Attachment/link if existing system supports this

Useful result categories:
- No Response
- Positive Response
- Negative Response
- Requested Information
- Requested Meeting
- Requested Offer
- Requested Follow-Up Later
- Referred to Another Person
- Not Relevant

Logging a contact should automatically update:
- Last Activity
- Last Contacted
- Outreach Attempts

---

# 16. Follow-Up Logic

Follow-up discipline is critical because the sales cycle can be 6–12 months.

The app should visibly highlight:
- follow-ups due today;
- overdue follow-ups;
- prospects with no recent activity.

The system should not automatically mark a prospect lost simply because there has been no response.

Allow:
- next follow-up date;
- follow-up reason;
- snooze/reschedule;
- dormant status.

If the existing app already has a task system, prefer creating/linking a task rather than building a separate duplicate task engine.

The new Prospecting page should integrate with existing tasks where possible.

Example:
"Follow up with John Smith at ABC Cement on 24 Sep"

This can appear:
- on the Prospecting page;
- in the existing My Work / Tasks page if available.

---

# 17. Public Tenders, Funding, Projects and Non-Contact Leads

The prospecting system must support opportunities that do not begin with one specific individual.

Create an "Opportunity Source" or "External Opportunity" record if needed.

Examples:
- public tender;
- public procurement;
- hydrogen valley;
- EU funding call;
- national funding call;
- industrial decarbonization program;
- announced H2 plant;
- power plant refurbishment;
- EPC-led project;
- consortium search.

Suggested fields:
- Opportunity title
- Type
- Country
- Organization
- Link
- Publication date
- Deadline
- Estimated value
- Relevant market
- Relevant product
- Fit / Notes
- Owner
- Status
- Next action
- Related companies
- Related contacts
- Promoted Sales Project

Suggested status:
- Identified
- Reviewing
- Relevant
- Contacting Partners / Client
- Preparing Submission
- Submitted
- Qualified
- Promoted
- Closed

Do not overcomplicate this in the first implementation.

It can be a subtype or secondary tab if the current database architecture makes that easier.

---

# 18. KPIs and Conversion Tracking

The page should calculate monthly and rolling metrics.

Core activity KPIs:
- New Contacts Added
- New Contacts Contacted
- Companies Contacted
- Follow-Ups Completed
- Meetings
- Engaged Prospects
- Qualified Opportunities
- Prospects Promoted to Sales Projects

Conversion KPIs:
- Contact → Reply %
- Contact → Positive Reply %
- Contact → Meeting %
- Contact → Qualified %
- Qualified → Sales Project %
- Contact → Sales Project %

Later, if linked to the project tracking page:
- Sales Project → Offer %
- Offer → Contract %
- Contract value by source
- Conversion by market
- Conversion by country
- Conversion by salesperson

Track average:
- Days from contact to first reply
- Days from contact to qualification
- Days from qualification to project
- Days since last activity

Do not initially over-emphasize contract-conversion metrics on the Prospecting page if the Sales Tracking page already handles them.

Instead, link/report from the existing project data.

---

# 19. Source Performance

Add a simple report showing lead-source effectiveness.

For each source:
- contacts created;
- engaged;
- qualified;
- promoted;
- conversion percentage.

Example:

| Source | Contacts | Engaged | Qualified | Promoted |
|---|---:|---:|---:|---:|
| Cold Outreach | 40 | 8 | 3 | 2 |
| Referral | 10 | 7 | 4 | 3 |
| Tender | 5 | 2 | 2 | 1 |

This will allow Hydrogenera to progressively allocate more effort to effective channels.

---

# 20. Market Performance

Track the same funnel by market.

Example:

| Market | Contacts | Engaged | Qualified | Promoted |
|---|---:|---:|---:|---:|
| CNG Optimisation | 24 | ... | ... | ... |
| Cement | 20 | ... | ... | ... |
| Generator Cooling | 16 | ... | ... | ... |
| Industrial H2 Users | 12 | ... | ... | ... |
| H2 Valleys | 8 | ... | ... | ... |

Also compare:
- planned monthly share;
- actual monthly share.

---

# 21. Monthly Target Planner

Allow sales managers/admins to configure:

- Monthly new contact target
- Weekly new contact target
- Target distribution by market
- Optional target distribution by salesperson

Default:
- 80 contacts/month
- 20 contacts/week

Default market allocation:
- 30% CNG Optimisation
- 25% Cement
- 20% Generator Cooling
- 15% Industrial H2 Users
- 10% H2 Valleys / H2 Production for Sale

Do not hard-code the targets permanently.

Store them as configurable settings.

---

# 22. Duplicate Prevention

Before adding a company/contact, check for likely duplicates.

Possible duplicate signals:
- same company name;
- same domain;
- same email;
- same LinkedIn URL;
- same person + company.

Show a warning but allow override.

When promoting a prospect:
- check whether the company already has an active Sales Project;
- allow linking to an existing project instead of creating another one.

---

# 23. Data Integrity and History

Important sales history must not be silently overwritten.

Keep:
- activity history;
- status change history;
- owner changes;
- promotion history;
- follow-up history.

If the existing application already includes audit-history functionality, reuse it.

Do not create unnecessary parallel history systems.

---

# 24. Existing Application Integration

Before coding, inspect the existing repository and reuse:

- existing design system;
- navigation;
- authentication;
- user/owner model;
- company model;
- contact model if one exists;
- Sales Project model;
- task model;
- activity history;
- status components;
- tables;
- filters;
- dialogs;
- date pickers;
- backend API patterns;
- database conventions.

Do not create duplicate models if equivalent entities already exist.

The new page should feel native to the existing application.

---

# 25. Recommended Navigation

Add a new navigation item:

**Prospecting**

Recommended sales navigation flow:

- Prospecting
- Sales Tracking / Pipeline
- Offers
- Tasks / My Work
- Reports

Use existing naming if these sections already exist.

---

# 26. UX Principles

The page should be:

- simple;
- fast;
- clear;
- operational;
- low-click;
- suitable for daily use;
- easy to scan;
- focused on next actions.

Avoid:
- excessive charts;
- oversized cards;
- decorative dashboards;
- complicated scoring;
- unnecessary animations;
- deeply nested screens.

The most important questions the user should be able to answer instantly are:

1. How many new contacts have I made this week/month?
2. Who do I need to contact today?
3. Who needs a follow-up?
4. Which prospects are engaged?
5. Which prospects are qualified?
6. Which prospects should move to Sales Tracking?
7. Which market/source is producing real opportunities?

---

# 27. Suggested Prospect Detail Drawer / Page

Clicking a prospect should show:

### Company
- identity
- market
- country
- site
- notes
- source
- priority

### Contacts
- list of all people at company
- role
- status
- contact details

### Strategy
- why this company is relevant
- proposed Hydrogenera application
- client problem/pain
- proposed message/approach

### Activity Timeline
- all outreach
- replies
- meetings
- notes
- follow-ups

### Qualification
- qualification fields
- project potential

### Next Action
- task/date/owner

### Sales Project
- link to promoted project if one exists

Use a side drawer if the current application favors quick editing, or a full detail page if that matches the existing UX.

---

# 28. Optional Outreach Preparation Fields

For contacts in "Contact Prepared", optionally allow:

- Contact objective
- Outreach angle
- Key Hydrogenera reference/case study
- Personalization note
- Draft message
- Planned channel
- Planned contact date

This helps Monday/Wednesday research flow directly into Tuesday/Thursday outreach.

Do not require these fields for every lead.

---

# 29. Suggested Initial Database Concepts

Use existing models where available.

Possible logical entities:

### ProspectCompany
- id
- companyId / linked Company
- marketCategory
- source
- priority
- ownerId
- status
- potentialValue
- addedAt
- lastActivityAt
- nextActionAt
- promotedProjectId

### ProspectContact
- id
- companyId
- existingContactId if applicable
- name
- title
- email
- phone
- linkedin
- ownerId
- status
- preparedAt
- firstContactedAt
- lastContactedAt
- nextFollowUpAt
- outreachAttempts
- primaryContact
- notes

### ProspectActivity
- id
- prospectCompanyId
- contactId
- userId
- activityType
- date
- summary
- result
- nextAction
- nextActionDate

### ProspectQualification
- prospectCompanyId
- identifiedProject
- product
- clientNeed
- timing
- estimatedValue
- budgetStatus
- fundingStatus
- decisionMakerIdentified
- technicalContactIdentified
- requestedNextStep
- confidence
- notes

### ProspectingTargets
- month
- user/team
- monthlyContactTarget
- weeklyContactTarget
- marketAllocation

Only create new tables if the existing architecture does not already have equivalent structures.

---

# 30. Implementation Priority

Build in phases.

## Phase 1 — Core Operating Page
Must include:
- Prospecting navigation/page
- prospect companies
- multiple contacts per company
- market category
- product
- source
- status
- priority
- owner
- next action
- follow-up date
- outreach log
- weekly/monthly 20/80 targets
- basic filters
- qualification
- Promote to Sales Project
- link to existing Sales Tracking
- preserve prospect history

## Phase 2 — Better Daily Workflow
Add:
- Monday/Tuesday/Wednesday/Thursday/Friday work view
- bulk contact preparation
- bulk outreach status updates
- overdue indicators
- saved filters
- source performance
- market performance
- target allocation

## Phase 3 — Automation / Intelligence
Only after core workflow works reliably:
- automatic reminders
- email integration
- LinkedIn/contact enrichment
- automatic lead discovery
- AI-assisted outreach drafts
- tender/funding monitoring
- automatic prospect scoring

Do not build Phase 3 complexity before the core workflow is stable.

---

# 31. Acceptance Criteria

The implementation is successful if a Hydrogenera salesperson can:

1. Add a new target company in under one minute.
2. Add multiple decision-makers to one company.
3. Categorize the company by Hydrogenera market and product.
4. See whether the prospect came from cold outreach, tender, referral, funding call, etc.
5. Prepare 10 contacts for the next outreach day.
6. Contact those people and log the result quickly.
7. Schedule and see follow-ups.
8. View overdue prospects.
9. Track progress against 20 weekly and 80 monthly new-contact targets.
10. See which prospects have replied.
11. Qualify a promising prospect.
12. Promote it into the existing Sales Tracking page without re-entering all information.
13. Keep the full prospecting history linked to the Sales Project.
14. See basic conversion by market and source.
15. Add new statuses such as "Warm" later without major refactoring.

---

# 32. Important Product / Market Facts

Use these current Hydrogenera product purity baselines in the application:

- **E-Series: 99.9% H2**
- **Z-Series: 99.999% H2**

Current market mapping:

- CNG Burning Optimisation → E-Series
- Cement Plant Optimisation → E-Series
- Power Plant Generator Cooling with H2 → Z-Series
- Clean H2 Production for Existing Industrial Processes → Z-Series
- Clean H2 Production for Sale / Hydrogen Valleys → Z-Series

Do not mix Z-Series and E-Series purity values.

---

# 33. Final Instruction to Cursor

Before implementing:

1. Inspect the existing repository.
2. Identify the existing Sales Tracking data model and status logic.
3. Identify existing Company, Contact, Task, User, Activity, and Project entities.
4. Identify existing UI components and design conventions.
5. Reuse these structures wherever possible.
6. Propose the minimal database changes required.
7. Implement the Prospecting page as a natural extension of the current app.
8. Keep the UX simple and operational.
9. Do not redesign unrelated parts of the application.
10. Do not break existing Sales Tracking behavior.
11. Ensure the prospect-to-project promotion flow is reliable and auditable.

The new page should become the **front end of the sales funnel**, while the existing Sales Tracking page remains the **project/opportunity management system after qualification**.
