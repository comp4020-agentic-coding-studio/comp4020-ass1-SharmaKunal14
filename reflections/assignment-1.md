# Assignment 1 — One More Road

## The breakthrough

The agent handed me a textbook result — a **+23.9%** Braess effect — and I nearly
took it. It had everything: clean conservation checks, a settled steady-state
verdict, plausible route shares. What made me suspicious was not the code but the
shape of the number. It was too good for a paradox whose theoretical ceiling is
about a third.

So instead of reading the implementation again, I asked what the number would
look like if it were wrong. If the queue were still growing, the effect would
depend on how long I watched. I re-ran the same configuration over a longer
horizon: +20.5% → +38.8% → +49.5% → +58.4%. It had never been an equilibrium.

The breakthrough was what I did next. My existing steady-state check had *passed*
while this happened, so re-prompting would have fixed one number and left the
hole. I wrote `horizonCheck` — re-run the configuration over a 1.75× horizon,
require the same answer — and made it a gate rather than a warning. Against the
whole parameter grid it reported that every Braess-positive configuration failed
it. Two more false results fell out the same way. The honest effect is +3.5%.

I found the bug by predicting its signature, not by reading code.

## What it changed

I used to direct an agent by describing what I wanted more precisely. Now I think
the real skill is building the thing that would catch the agent being
convincingly wrong — and being willing to spend hours proving my own best result
was worthless. A check that makes a failure mode unpassable is worth more than
any number of clarified prompts, because it keeps working when I stop paying
attention. I would rather ship +3.5% I can defend than +24% I merely liked.
