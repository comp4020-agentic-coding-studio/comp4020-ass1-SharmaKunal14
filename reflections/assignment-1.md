# Assignment 1 — One More Road

## The breakthrough

The agent handed me a **+23.9%** Braess effect and I nearly accepted it. It had
clean conservation checks, a steady-state verdict and plausible route shares. The
number was not impossible in Braess networks generally; my concern was narrower:
it looked too large for the measured congested-to-free-flow range of *this* street
model.

Rather than rereading the implementation, I predicted what an unfinished queue
would do. If the result was not an equilibrium, it would depend on how long I
watched. The same configuration changed from +20.5% to +38.8%, +49.5% and +58.4%
over longer horizons. The existing within-window check had passed while the queue
grew slowly.

I therefore added `horizonCheck`: rerun the candidate over a 1.75× horizon and
require the answer to remain stable. I made it a gate, not a warning. Applied to
the parameter grid, it rejected every apparently Braess-positive candidate. After
correcting the network geometry and route learning, the defensible settled effect
was roughly +4%, with a lower-demand control in which the same connector helped.

## What it changed

I used to think directing an agent mainly meant specifying the desired output more
precisely. This episode changed the emphasis: I now try to specify the evidence
that could falsify the output. Conservation was necessary but did not test
equilibrium; a convincing number passed because my oracle was incomplete. The most
valuable intervention was not another prompt or a larger-looking result, but a
check that makes this failure mode hard to repeat. I would rather present a modest
effect with explicit limits than a dramatic result supported by the wrong test.
