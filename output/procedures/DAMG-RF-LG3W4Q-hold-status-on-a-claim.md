---
title: "Vehicle estimate hold"
url: "https://mdp.partners.icbc.com/topic/DAMG-RF-LG3W4Q-hold-status-on-a-claim?map=DAMG-MP-NRP91J-vendors"
content_url: "https://mdp.partners.icbc.com/topics/DAMG-RF-LG3W4Q-hold-status-on-a-claim.html"
category: "Vehicle damage > Estimates"
description: "An estimate hold is applied to a repair estimate by ClaimCenter or an auto claims specialist, to prevent financial payments for repairs or total loss settlements from proceeding until the hold is removed."
date_modified: "2026-04-02"
scraped_at: "2026-04-28T20:09:12.321911"
---

# Vehicle estimate hold

An estimate hold is applied to a repair estimate by ClaimCenter or an auto claims specialist, to prevent financial payments for repairs or total loss settlements from proceeding until the hold is removed.

### Rationale for a vehicle estimate hold

The requirement of a vehicle estimate hold is based on business rules, not Repair Network Qualification Rules. A hold estimate is only meant to be temporary, and while in place, estimators are still able to complete any preliminary work or override failed qualification rules, if applicable.

Payments for vehicle repairs, total loss settlement, or loss of use, cannot be made if the repair estimate has a hold status.

Note: For details on how a vehicle estimate hold is applied, refer to ClaimCenter User Guide topic, [Hold Estimate - Automatic or manual](Topic.aspx?rootmap=ClaimCenter-user-guide&topic=CCUG-CO-SCA3H6-auto-holds-rep-est "A hold estimate is applied to a claim automatically by or manually by staff, depending on the applicable hold estimate rational option.").

### Business rules

ClaimCenter runs automated business rules to apply vehicle estimate holds for

* breach investigations, and
* coverage verifications.

Staff can manually apply a vehicle estimate hold for the "Other" situations not captured by automated rules, such as when a

* debt is owed, or
* special (unique) circumstance.

### Application examples

Examples of when the three ClaimCenter vehicle estimate hold rationale options are applied:

| Vehicle estimate hold rationale | Example |
| --- | --- |
| Breach Investigation | * A breach or fraud investigation is associated with the registered owner, and the vehicle is not leased. * A special Investigation Unit (SIU) investigator or officer is required.  Note: When the registered owner (RO) or lessor is not in breach, do not apply a hold. |
| Coverage Verification | Customer does not have coverage available based on the  * type of loss, or * policy is expired. |
| Other | * The vehicle's RO or lessee has an outstanding debt. * Vehicle is being held for salvage. * An external engineer is hired by plaintiff counsel (PC) or defence counsel (DC) to examine the vehicle. * PC or DC requests a hold. |

### Removal of vehicle estimate hold

An auto claims specialist is responsible for

* removing a vehicle estimate hold, once the reason for removing the hold has been met, and
* rerunning the Repair Network Qualification rules to determine if the claim now qualifies.

If after rerunning the Repair Network Qualification rules and the claim

* qualifies, the auto claims specialist contacts the customer to advise them of the next steps, such as rescheduling their repair , or
* continues to remain not qualified, ClaimCenter automatically generates a “Hold Removed from Estimate” activity to notify the estimator, assuming an EST activity has been generated, and assigned to an estimator.

Note: For details, refer to the ClaimCenter User Guide procedure, [Removal of hold estimate](Topic.aspx?rootmap=ClaimCenter-user-guide&topic=CCUG-PD-J83F85-00-remove-a-hold-on-a-claim "How to manually remove the hold on a  , when an investigation concludes that it is okay to proceed with payments for repairs or total loss settlements.").

**Parent topic:** [Estimates](../topics/DAMG-TP-9B7JPE-estimates.html)