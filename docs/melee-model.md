# Melee model: wiki-human-0.1.0

The Melee lab is an experimental Monte Carlo comparison of handheld RimWorld weapons against a passive, natural adult human. Its primary outcome is time to the first incapacitation: downing **or** death. It is a model of wiki descriptions, not a verified recreation of RimWorld combat. No game files, decompiled code, or installed game version are used.

## Scope and clock

Each trial begins with a fresh human body and the same attacker/target settings. The attacker is already in melee range, ready to strike at time **0 seconds**. A one-swing incapacitation consequently takes 0 seconds. After each swing, including a miss, block, or dodge, the selected attack's cooldown determines the next swing. The model uses continuous seconds and fractional damage, rather than game tick and integer rounding.

The target can dodge but cannot retaliate, move away, use abilities, or get treatment. The attacker remains healthy with constant capacities. Attack effects are resolved together before evaluating the endpoint. Stop conditions are death, pain at or above the configured shock threshold, consciousness below 30%, or moving at/below 15%. Temporary stun does not count. Storyteller death-on-down rolls and subsequent death of an already downed pawn are excluded.

## Inputs and provenance

`site/assets/melee-data.js` contains a committed snapshot of 567 literal attack-table rows across 24 wiki weapon pages, plus 39 human body-part types expanded to 63 individual parts. An additional unarmed benchmark uses the human natural attacks. The importer retains the wiki revision IDs and permanent `oldid` links. The snapshot does not promise an exact correspondence with a particular RimWorld patch; wiki pages can differ in currency.

`python scripts/import_melee_wiki.py --cache .qa/wiki` imports the data using Python's standard library. It reuses cached HTML, downloading missing pages. To refresh deliberately, use a fresh cache directory. Review the generated diff and run tests before committing. Website visitors do not query the wiki. Original table values, including rounded penetration values, are used; the simulator does not infer material eligibility or combine every material with every weapon. Weapons, qualities, and materials each allow multiple selections, with All and Clear controls. Only existing variants matching all three selected sets and enabled DLC are included. Fixed-quality items use the explicit **Fixed** quality option; weapons without a material variation use **No material**. Defaults are all weapons/materials and Normal plus Fixed qualities. The optional unarmed benchmark is selected independently. JSON exports record the selected sets as arrays. DLC requirements combine the weapon's page banner with Bioferrite (Anomaly), Obsidian and Vacstone blocks (Odyssey).

The user's [Weapon Guide reference](https://rimworldwiki.com/wiki/Weapon_Guide) motivates the comparison. Detailed rule sources are [Weapons](https://rimworldwiki.com/wiki/Weapons), [Damage types](https://rimworldwiki.com/wiki/Damage_types), [Apparel](https://rimworldwiki.com/wiki/Apparel), [Human](https://rimworldwiki.com/wiki/Human), [Injury](https://rimworldwiki.com/wiki/Injury), [Pain](https://rimworldwiki.com/wiki/Pain), [Health](https://rimworldwiki.com/wiki/Health), [Moving](https://rimworldwiki.com/wiki/Moving), [Consciousness](https://rimworldwiki.com/wiki/Consciousness), [Melee Hit Chance](https://rimworldwiki.com/wiki/Melee_Hit_Chance), [Melee Dodge Chance](https://rimworldwiki.com/wiki/Melee_Dodge_Chance), and [Melee Damage Factor](https://rimworldwiki.com/wiki/Melee_Damage_Factor). The page lists permanent revisions for imported sources.

## Attack selection and accuracy

Every equipped attack joins two fists (8.2 damage, 2s cooldown, 12% AP), teeth (same stats, chance factor .07), and head (5 damage, 2s, 7.5% AP, chance factor .2). These are natural adult human attacks without implants. Each attack has a score:

```
score = damage × (1 + armorPenetration) × chanceFactor / cooldown
```

Attacks with scores at least 95% of the maximum are Best. Scores below 25% of maximum are Worst; the rest are Mid. Best attacks share 75% selection probability and Mid attacks share 25%, equally within each group. If there is no Mid group, Best attacks share 100%. Worst attacks are never selected.

Attacker damage factor multiplies all physical attacks. AP scales with damage except the spear's point and the monosword/persona monosword's sharp attacks, whose AP is independently specified. The cooldown factor multiplies every attack's cooldown. Selection is recalculated using adjusted stats.

Hit score is `skill + 12 × (min(manipulation, 1.5) − 1) + 12 × (min(sight, 1.5) − 1) + offset`. Linear interpolation uses these (score, chance) anchors: (−20, .05), (−10, .10), (0, .50), (10, .80), (20, .90), (40, .96), (60, .98), clamping beyond the endpoints.

Dodge score is `targetSkill + 18 × (moving − 1) + 8 × (min(sight, 1.4) − 1) + offset`. Dodge chance is zero through score 5, increases to 30% at 20 and 50% at 60, and caps there. Hit and dodge use independent rolls. Moving and sight update with target injuries. Stuns do not temporarily suppress dodge. Brawler and Nimble can be represented by offsets +4 and +15 respectively; other trait effects are not automatically inferred.

## Armor

All target equipment is Normal quality with fixed protection and no durability loss:

| Preset | Equipment | Sharp / blunt / heat |
| --- | --- | --- |
| Unarmored | None | 0 / 0 / 0 |
| Flak | Flak vest; steel simple helmet; cloth button-down shirt and pants | Vest: 100% / 36% / 27%; helmet: 45% / 22.5% / 30% |
| Marine | Marine armor and helmet; cloth button-down shirt and pants | Armor and helmet: 106% / 45% / 54% |

Cloth shirt and pants add 7.2% sharp, 0% blunt and 3.6% heat protection. Coverage uses the wiki body groups directly. Flak vest covers torso and neck; marine armor also covers shoulders, arms and legs. Simple helmet covers upper head and ears, leaving eyes, nose and jaw exposed. Marine helmet covers the full head. Hands and feet are exposed. Internal parts use their listed body groups.

For each covered item, outer to inner, effective armor is `max(rating − AP, 0)`. A uniform roll below half the effective armor blocks the damage. A roll below effective armor halves damage; sharp damage also becomes blunt. Deeper layers then use the blunt rating. An item occupying multiple layers is tested once. Poke uses blunt armor. Heat does not convert. There is no natural human armor.

## Damage and anatomy

Physical attack damage is multiplied by uniform random 0.8–1.2 and the target's incoming-damage factor. Body-part selection uses the wiki's absolute residual coverage values, with one entry per left/right part. Missing subtrees are removed and remaining probabilities normalized. The parent-child structure supplies adjacent parts. Internal selection and adjacency are an interpretation of the wiki prose and remain a source of model error.

* Blunt/Demolish select an external part, excluding eyes. With 40% chance, if a contained internal part is available, 10–20% of base damage is diverted to it, plus an additional 20–35%. Internal parts beneath an unbroken chain of internal parents are eligible, so the brain can be reached through the skull. Excess damage from destroying a part carries to an external parent. Demolish's building multiplier is irrelevant here.
* Stab/Poke initially sample internal or external parts, excluding the brain. An external selection redirects to an immediate internal child with 60%/40% chance if available. An internal hit deals 40% to it and each internal ancestor, then 75% to the first external ancestor. Exterior hits deal full damage. A sharp armor deflection instead uses blunt routing.
* Cut chooses 1/2/3/4 parts with probabilities 30%/45%/20%/5%. A single hit samples external parts only; multi-hits may begin inside. Additional parts are sampled by coverage from the unselected parent/child frontier of the selected set. With N targets, per-part damage is `base × 2.4 / (N + 1.4)`. Only the initial part rolls armor. Eligible unselected parents of internal hits receive the same damage, stopping at bone or an external part. This frontier selection is an approximation of in-game adjacency.
* Scratch starts outside and samples up to two different parts uniformly from the initial part, its children, parent and siblings, applying 67% post-armor damage to each. The wiki marks details of scratch selection as uncertain. Internal-initial scratch hits are omitted.
* Missing-part overkill uses the wiki's probability `clamp((overkill / maximumHP − lower) / (upper − lower))`. The lower/upper ranges are Cut/Bite 0–.1, Scratch 0–.7, and Blunt/Poke/Stab/Demolish .4–1. Failing destruction leaves 1 HP (or the part's max HP if smaller). Wiki indestructible bones cannot be removed. A destroyed parent removes its descendants and their accumulated injury pain.
* Plasmasword sharp hits that pass armor have a 50% simplified additional 10-heat-damage proc. It selects an external part, rolls heat armor with 0 AP, and uses the target damage multiplier. The prototype applies its common 0.8–1.2 variation to this proc as well. It does not reproduce ignition, fire spread, ongoing burns, panic or exact proc location/trigger semantics. Plasma rankings are incomplete. EMP has no direct effect on the natural human target. Improvised weapon consumption/breakage is excluded.

## Pain, capacities, and death approximations

HP scales with target health scale. Part efficiency is remaining HP / maximum HP, zero for missing parts. Ordinary fresh injury pain is .0125 per HP; burns use .01875. Total pain is divided by health scale, multiplied by the pain factor and clamped to [0,1]. Missing-part pain is approximated by one full-HP fresh injury on the missing root; descendant injuries are cleared. Brain-scar pain, permanent injury behavior, pain decay and healing are excluded.

The following aggregation is explicit model code, **not a verified game capacity implementation**. Let `E(part)` mean average efficiency across the remaining left/right instances, including zero for lost parts:

```
heart = E(Heart)
breathing = E(Lung) × (1 − .5 × (1 − E(Ribcage)))
filtration = (E(Liver) + E(Kidney)) / 2
consciousness = clamp(E(Brain) × (1 − .2 × (1 − heart))
    × (1 − .2 × (1 − breathing)) × (1 − .1 × (1 − filtration))
    − max(0, (pain − .1) / 2.25))
legEfficiency = E(Leg) × E(Tibia) × E(Femur) × E(Foot)
    × (.6 + .04 × sum(all ten toe efficiencies)) × E(Pelvis) × E(Spine)
moving = initialMoving × consciousness × (1 − .2 × (1 − heart))
    × (1 − .2 × (1 − breathing)) × legEfficiency
sight = initialSight × (.75 × betterEye + .25 × worseEye)
```

The wiki's moving formula supplies the multiplicative structure. Organ aggregation and the combination of brain and pain effects are approximations where source descriptions are incomplete or inconsistent. Sight does not separately scale with consciousness. Death occurs on destruction of torso, neck, head, brain, heart, or liver, loss of both lungs or both kidneys, or zero consciousness.

There is **no bleeding progression**. Sharp weapons' long-duration performance and bleed-related downing/death can therefore differ materially from the game. This should be addressed and calibrated before treating the tool as a gameplay predictor. Armor wear, other targets/species, retaliation, movement, drugs, genes, implants, special traits, persona traits and procedural unique weapons also need separate extensions and validation.

## Sampling and interpretation

The seeded PRNG is Mulberry32 with a 32-bit FNV-1a hash of the textual seed, variant ID and zero-based trial index. Every trial has its own stream, independent of weapon order, filters and total trial count. Increasing trials preserves the previous trial prefix. Different weapons use independent streams; this is not a paired common-random-number experiment. Log collection does not consume extra random draws. Reproducibility is tied to the model version and wiki snapshot as well as settings/seed.

Every trial is followed until its event or the administrative time limit, inclusive. Unfinished outcomes are represented as `null` in exported times, not assigned an invented event time. With the same fixed censoring time for all runs, the empirical survival estimator below that time is simply event count / total count. Percentiles use nearest ranks over all trials, treating censored outcomes as later than any observed event. Median becomes observable at 50% events; otherwise it is “Not reached (>limit).” P10 and P90 follow the same rule.

Median 95% intervals are distribution-free order-statistic bounds, with ranks chosen from the Binomial(n,.5) tail at .025. An endpoint extending beyond the observation window is reported as censored. Probability intervals are two-sided 95% Wilson intervals. Ties can make the median interval conservative. Intervals quantify Monte Carlo sampling error **within the model**, not fidelity to RimWorld. They are individual-variant intervals with no multiple-comparison correction. Ranking hundreds of noisy estimates can produce an apparent winner by chance; narrow the pool and rerun with more trials and other seeds.

“Dead first” divides deaths at the initial incapacitation by **all trials**, including timeouts. It is not conditional on incapacitation and does not estimate later mortality. CSV exports the currently searched results plus configuration, censoring, and model metadata. JSON exports the full completed subset, raw times, requested variant IDs, source revisions and settings. A stopped run explicitly represents only its completed subset. The page marks results stale if settings change. Runs are capped at two million trials per request to keep the browser workload manageable. No results are uploaded or saved automatically.

## Validation

Run `node --test tests/melee-engine.test.cjs`. Tests cover independent wiki anchors, attack mixtures, analytic armor frequencies, coverage, capacities, injury routing, overkill, censoring/intervals, seeded replay and all 567 variants. An artificial one-hit target checks the simulation clock and event probabilities against a geometric distribution. This verifies code against the stated model, not against the game.

Optional DOM integration: install jsdom 30.1.3 locally and run `node tests/melee-ui.cjs` (or pass its module directory as an argument). It exercises both the real worker script via a Node worker bridge and the browser fallback, verifies replay/exports, validation, sorting, filtering, cancellation, restart and censored presentation. It does not render or visually assess the page.

## Attribution

Imported tables and adapted wiki rule descriptions: **RimWorld Wiki contributors**, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Changes include extraction into structured data, rule selection, formula restatement and the explicitly documented approximations. This document and the imported wiki snapshot retain CC BY-SA 3.0. See each source revision linked on the page for authorship history. RimWorld is by Ludeon Studios; this project is unofficial.
