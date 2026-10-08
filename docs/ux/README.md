# Before and after: the five core flows

Measured on the iOS 27 simulator with `tools/ui-driver/run-flows.sh`: same seed data, fresh install per flow. Baseline: tag `ux-baseline-2026-10-09`. Counts are what a person has to do. Full analysis is in `docs/ux-validation-report.md`.

| Flow | Before (taps / scrolls / screens) | After |
|---|---|---|
| F1 First launch → first expense (no account) | 6 / 0 / 6 | **4 / 0 / 4** |
| F2 Repeat group expense, split equally | 7 / 1 / 6 | **4 / 0 / 4** |
| F3 Create a group + add 2 people without accounts | 9 / 0 / 6 | **5 / 0 / 4** |
| F4 See what I owe and record paying it back | 5 / 1 / 6 | **3 / 0 / 4** |
| F5 Correct a wrong group-expense amount | 6 / 0 / 4 | **5 / 0 / 4** |

## F1. First launch → first expense (no account)

**Before**: 6 taps, 0 scrolls, 6 screens (welcome → currency → account-choice → home → new-expense → saved)

<img src="before/before-F1-01-welcome.jpg" width="150" alt="before-F1-01-welcome.jpg"> <img src="before/before-F1-02-currency.jpg" width="150" alt="before-F1-02-currency.jpg"> <img src="before/before-F1-03-account-choice.jpg" width="150" alt="before-F1-03-account-choice.jpg"> <img src="before/before-F1-04-home.jpg" width="150" alt="before-F1-04-home.jpg"> <img src="before/before-F1-05-filled.jpg" width="150" alt="before-F1-05-filled.jpg"> <img src="before/before-F1-05-new-expense.jpg" width="150" alt="before-F1-05-new-expense.jpg"> <img src="before/before-F1-06-saved.jpg" width="150" alt="before-F1-06-saved.jpg">

**After**: 4 taps, 0 scrolls, 4 screens (welcome → home → new-expense → saved)

<img src="after/after-F1-01-welcome.jpg" width="150" alt="after-F1-01-welcome.jpg"> <img src="after/after-F1-02-home.jpg" width="150" alt="after-F1-02-home.jpg"> <img src="after/after-F1-03-filled.jpg" width="150" alt="after-F1-03-filled.jpg"> <img src="after/after-F1-03-new-expense.jpg" width="150" alt="after-F1-03-new-expense.jpg"> <img src="after/after-F1-04-saved.jpg" width="150" alt="after-F1-04-saved.jpg">

## F2. Repeat group expense, split equally

**Before**: 7 taps, 1 scrolls, 6 screens (home → add-menu → group-picker → add-expense → confirm → saved)

<img src="before/before-F2-01-home.jpg" width="150" alt="before-F2-01-home.jpg"> <img src="before/before-F2-02-add-menu.jpg" width="150" alt="before-F2-02-add-menu.jpg"> <img src="before/before-F2-03-group-picker.jpg" width="150" alt="before-F2-03-group-picker.jpg"> <img src="before/before-F2-04-add-expense.jpg" width="150" alt="before-F2-04-add-expense.jpg"> <img src="before/before-F2-04-filled.jpg" width="150" alt="before-F2-04-filled.jpg"> <img src="before/before-F2-05-confirm.jpg" width="150" alt="before-F2-05-confirm.jpg"> <img src="before/before-F2-06-saved.jpg" width="150" alt="before-F2-06-saved.jpg">

**After**: 4 taps, 0 scrolls, 4 screens (home → add-menu → add-expense → saved)

<img src="after/after-F2-01-home.jpg" width="150" alt="after-F2-01-home.jpg"> <img src="after/after-F2-02-add-menu.jpg" width="150" alt="after-F2-02-add-menu.jpg"> <img src="after/after-F2-03-add-expense.jpg" width="150" alt="after-F2-03-add-expense.jpg"> <img src="after/after-F2-03-filled.jpg" width="150" alt="after-F2-03-filled.jpg"> <img src="after/after-F2-04-saved.jpg" width="150" alt="after-F2-04-saved.jpg">

## F3. Create a group + add 2 people without accounts

**Before**: 9 taps, 0 scrolls, 6 screens (shared → shared-menu → new-group → group → settings-people → group-with-people)

<img src="before/before-F3-01-shared.jpg" width="150" alt="before-F3-01-shared.jpg"> <img src="before/before-F3-02-shared-menu.jpg" width="150" alt="before-F3-02-shared-menu.jpg"> <img src="before/before-F3-03-filled.jpg" width="150" alt="before-F3-03-filled.jpg"> <img src="before/before-F3-03-new-group.jpg" width="150" alt="before-F3-03-new-group.jpg"> <img src="before/before-F3-04-group.jpg" width="150" alt="before-F3-04-group.jpg"> <img src="before/before-F3-05-people-added.jpg" width="150" alt="before-F3-05-people-added.jpg"> <img src="before/before-F3-05-settings-people.jpg" width="150" alt="before-F3-05-settings-people.jpg"> <img src="before/before-F3-06-group-with-people.jpg" width="150" alt="before-F3-06-group-with-people.jpg">

**After**: 5 taps, 0 scrolls, 4 screens (shared → shared-menu → new-group → group-with-people)

<img src="after/after-F3-01-shared.jpg" width="150" alt="after-F3-01-shared.jpg"> <img src="after/after-F3-02-shared-menu.jpg" width="150" alt="after-F3-02-shared-menu.jpg"> <img src="after/after-F3-03-filled.jpg" width="150" alt="after-F3-03-filled.jpg"> <img src="after/after-F3-03-new-group.jpg" width="150" alt="after-F3-03-new-group.jpg"> <img src="after/after-F3-04-group-with-people.jpg" width="150" alt="after-F3-04-group-with-people.jpg">

## F4. See what I owe and record paying it back

**Before**: 5 taps, 1 scrolls, 6 screens (home → shared → group → balances → record-payment → recorded)

<img src="before/before-F4-01-home.jpg" width="150" alt="before-F4-01-home.jpg"> <img src="before/before-F4-02-shared.jpg" width="150" alt="before-F4-02-shared.jpg"> <img src="before/before-F4-03-group.jpg" width="150" alt="before-F4-03-group.jpg"> <img src="before/before-F4-04-balances.jpg" width="150" alt="before-F4-04-balances.jpg"> <img src="before/before-F4-05-record-payment.jpg" width="150" alt="before-F4-05-record-payment.jpg"> <img src="before/before-F4-06-recorded.jpg" width="150" alt="before-F4-06-recorded.jpg">

**After**: 3 taps, 0 scrolls, 4 screens (home → group → record-payment → recorded)

<img src="after/after-F4-01-home.jpg" width="150" alt="after-F4-01-home.jpg"> <img src="after/after-F4-02-group.jpg" width="150" alt="after-F4-02-group.jpg"> <img src="after/after-F4-03-record-payment.jpg" width="150" alt="after-F4-03-record-payment.jpg"> <img src="after/after-F4-04-recorded.jpg" width="150" alt="after-F4-04-recorded.jpg">

## F5. Correct a wrong group-expense amount

**Before**: 6 taps, 0 scrolls, 4 screens (shared → group → edit-expense → saved)

<img src="before/before-F5-01-shared.jpg" width="150" alt="before-F5-01-shared.jpg"> <img src="before/before-F5-02-group.jpg" width="150" alt="before-F5-02-group.jpg"> <img src="before/before-F5-03-edit-expense.jpg" width="150" alt="before-F5-03-edit-expense.jpg"> <img src="before/before-F5-03-edited.jpg" width="150" alt="before-F5-03-edited.jpg"> <img src="before/before-F5-04-saved.jpg" width="150" alt="before-F5-04-saved.jpg">

**After**: 5 taps, 0 scrolls, 4 screens (shared → group → edit-expense → saved)

<img src="after/after-F5-01-shared.jpg" width="150" alt="after-F5-01-shared.jpg"> <img src="after/after-F5-02-group.jpg" width="150" alt="after-F5-02-group.jpg"> <img src="after/after-F5-03-edit-expense.jpg" width="150" alt="after-F5-03-edit-expense.jpg"> <img src="after/after-F5-03-edited.jpg" width="150" alt="after-F5-03-edited.jpg"> <img src="after/after-F5-04-saved.jpg" width="150" alt="after-F5-04-saved.jpg">

## Web: shared pages (after)

<img src="after/web-p-creditor.jpg" width="200" alt="creditor"> <img src="after/web-p-debtor-masked-organizer.jpg" width="200" alt="debtor"> <img src="after/web-g-dead-link.jpg" width="200" alt="dead link">

Dark mode and the largest text size: `after/dark-mode-and-large-text.jpg`.
