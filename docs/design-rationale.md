# Vantage -- Design Rationale

## Total time spent

**Total:** ~4 hours

- _Development:_ 2 hours (plus one tiny bug fix during deployment)
- _Deployment:_ 50 minutes
- _Documentation:_ 50 minutes

## Why this theme?

Figuring out a new codebase is a task every engineer faces over and over throughout their career, and for some, in their spare time. LLMs have made this easier by giving us ways to interrogate the code, but I haven't seen (so far) any purpose-built interfaces for it.

## Why this approach?

We (the software industry) already have a fertile ground to build on, so why not use it?

### Bringing together two worlds

Static analysis has been around for decades, but the output from these tools can be... terse. In the world of JS, for example, we have bundling tools, but these tools are geared more toward performance optimization instead of conceptual understanding.

LLMs are great at pulling in context and making predictions, but they need support to function at their best. Locally, Claude understand well how to do things like search and parse through files; but having ready access to a graph of how all the code in a repo relates is exactly the additional information to push it to the next level.

### Priming the user experience with a metaphor

Everybody has their own approach to learning new codebases, and the same is the case here. By framing Vantage as an "orienteering" tool and using terms like "elevation" and "trail markers," we're giving people a mental model to work from and giving them clues as to what to expect.

### Prioritizing "interesting-ness"

When I'm new to something -- especially something complex -- one of the most time-consuming parts of the experience of learning is figuring out where to direct my attention. Lots of code is what we'd consider routine: patterns we all know and which don't give us much return on our time from a study perspective. What I really need is someone who knows the ropes to tell me, "this is where the magic happens." Code holds all kinds of hidden assumptions, and understanding those assumptions quickly allows us to ramp up without wearing ourselves out on the boring details.

## Design decisions

### Code analysis

Vantage looks at code using multiple heuristics and assigns a score to every file (higher = more interesting). We (myself and Claude) limited ourselves to only a handful of heuristics for this demonstration:

- **Recency of the latest change:** "hot" files tend to be more interesting than ones rarely touched
- **Dynamic imports:** If we're importing something dynamically, that's unusual enough to be a strong clue that we're on a hot path, or something else is happening worth paying attention to.
- **Boundary crossings:** When code crosses package or app boundaries, that's a strong sign something is happening that adds important functionality but could also introduce subtle bugs. Oftentimes these boundaries don't have enforced contracts shared between the two (or more) sides.
- **Complex state:** State management is one of the more frought parts of software development in general, and when we're doing a lot of it, something complex is definitely happening.
- **High levels of "fan-in":** Basically, code that's referenced in lots of places. If it's being used everywhere, it's probably at least worth a look.

## Technical trade-offs

A lot of hard trade-offs had to happen to fit into the time allotted:

- **Only TypeScript and React repos:** These are the ones I'm most familiar with, and it cuts down on the number of tools required to generate good code analysis. A more robust version would have plugins per-language, per-framework, and/or even per-heuristic.
- **Cheap heuristics:** We could've had an LLM do a fuller analysis of the entire codebase in the background as a new repo is loaded, but this was a much heavier lift and much more money than I was prepared to spend. The recency heuristic mentioned above could be helpful, but not on a fresh Git clone because timestamps might be set to the time of the clone. Even more deterministic heuristics are available but would've been harder to spec out in such a short time.
- **Fast, cheap analysis:** `dependency-cruiser` and `ts-morph` get us out of building analysis tooling ourselves, but they each have their own limitations. `ts-morph` isn't as powerful as a full TypeScript language server, for example.
- **Scoring can be inaccurate:** If a file doesn't have _enough_ signals, Vantage will skip over it, even if it has one very powerful signal.

## Future roadmap

There's lots we can do to boost Vantage's effectiveness. I de-scoped a lot of ideas myself, because I want to respect the time limits of the assignment.

### Architecture-level stuff

- **Re-structure as an IDE extension instead of a web app.** The web is where I'm most familiar, so going that route for this assignment allowed me to skip over unfamiliar technical details around the architecture of IDE extensions that could've killed several hours. An LLM could've helped, but better to eliminate the uncertainty up-front. There's also the fact that not everyone uses VS Code, so the number of build targets could have cost even more time.
- **Better handling of large codebases.** I didn't test with any truly massive repos, but we'd likely need to make some changes to keep everything efficient.

### Feature-level stuff

- **More and better analysis heuristics.** There are many different signals we can use to detect tricky code, messy code, critical paths, and so on. For example, we could analyze how much documentation sits around certain functions or inside files. Lots of documentation, lots of test coverage, or a conspicuous LACK of those things could all be useful not just for beginners but for core maintainers. We could also use a combo of LLMs and static analysis to group files semantically by which features they support.
- **Integration with Git blame.** Git blame gives us so much extra information we can use. One neat use case might be to surface not just a way to ask questions to an LLM, but to say "you should talk to Person XYZ who maintains this code."
- **More effective context for asking questions to the agent/LLM.** We only send the first 6000 characters of a file as context when asking questions, which means for longer files we're essentially cutting off the possibility for good explanations. The reasoning here is mostly cost-cutting, because the project is set to use an Anthropic API key with only $5 of allowance.
- **Complexity heatmaps:** We could have clearer representation in the UI for files and areas where complexity is high vs where it's low.

### Paper cuts, bugs, and auxiliary concerns

- **A full security audit.** Given we're handling entire file trees, at least one API key, and user input to an LLM, this app would be very well served with a sweep for security issues. I just didn't have the time to do this and deliver the rest in the time allotted.
- **Test coverage.** The value simply wasn't there for the purposes of a demo project with a limited time frame. I prioritized feature delivery over all else.
- **Accessibility and better UX.** Immediately I can say that I don't like having to click the _Ask_ button to submit a question about code -- that should be triggered by an Enter key. The app could also give users a more gratifying experience by streaming in those answers instead of waiting for the whole response. I'm sure there are lots of little edges like this that could be handled even in a short time.
