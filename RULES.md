# Orbment Solver Rules

## Layout

- There are four lines: `武器`, `护盾`, `驱动`, and `Extra`.
- Each line has four slots.
- Each slot starts as `normal`.
- A slot can be set to:
  - `disabled`: cannot equip quartz.
  - `normal`: can equip any legal quartz.
  - element-specific: one of `地`, `水`, `风`, `火`, `时`, `空`, `幻`.

## Quartz Data

- Quartz are loaded from `kai-quartz.csv`.
- The file uses tab-separated columns:
  - quartz name
  - quartz elemental type
  - quartz elemental values
- Example rows:
  - `魔防2	水	水×4`
  - `三月兔	空	空×5，风×3`
- Each quartz can be equipped at most once in the final plan.

## Slot Compatibility

- Disabled slots cannot equip quartz.
- Normal slots can equip any quartz allowed on that line.
- Element-specific slots can only equip quartz whose elemental type matches the slot element.
- If a quartz is equipped in a matching element-specific slot, all of its elemental values are doubled.
  - Example: `三月兔	空	空×5，风×3` in an `空` slot counts as `空×10，风×6`.

## Line Restrictions

Some quartz are restricted by name:

- Quartz with `刃` in the name can only be placed on `武器` or `Extra`.
- Quartz with `轮` in the name can only be placed on `护盾` or `Extra`.
- Quartz with `诗` in the name can only be placed on `驱动` or `Extra`.
- Quartz without those markers can be placed on any line.

## Elemental Requirements

- The user can enter elemental value requirements for each line.
- A line satisfies its requirements if its summed values meet or exceed every requested elemental value.
- A line with no elemental requirement is skipped unless it is needed to place mandatory quartz.
- Values on a line are computed by summing the equipped quartz contributions on that line.

## Mandatory Quartz

- The user can select a list of quartz that must appear in the final result.
- Mandatory quartz are selected globally, not for a specific line.
- The solver decides where to place them, while still respecting:
  - disabled slots
  - element-specific slots
  - line restrictions
  - global quartz non-reuse
- If a mandatory quartz cannot be legally placed, the search reports not found.

## Excluded Quartz

- The user can select a list of quartz that must not appear in the final result.
- Excluded quartz are selected by quartz name, not by elemental values.
  - Example: excluding `HP3	水	水×6` does not exclude `魔防3	水	水×6`.
- A quartz cannot be both mandatory and excluded. If that happens, the input is invalid.

## Search Results

- The solver brute-forces valid combinations.
- If no combination satisfies the requirements, mandatory quartz list, and excluded quartz list, it reports not found.
- If more than 20 possible combinations are found, the solver stops and alerts the user.
- Results avoid irrelevant extra quartz:
  - If a non-mandatory equipped quartz can be removed while still satisfying all requirements, that assignment is filtered out.
  - If a non-mandatory equipped quartz can be replaced by an unused, legal weaker quartz and still satisfy all requirements, that assignment is filtered out.
  - Exact same-value quartz with the same elemental type and line eligibility are treated as duplicate result variants; the earlier row in `kai-quartz.csv` is shown as the canonical choice.
  - Mandatory quartz are kept even when they are not needed for elemental totals.
