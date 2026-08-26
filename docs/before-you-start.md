# 🎒 Before You Start — What to Learn First

This project teaches **Docker, Kubernetes, Terraform, AWS and CI/CD**. You do **not** need to
know any of those before starting — teaching them is the whole point.

But the project *assumes* a small set of foundations. If those are shaky, every lesson gets
twice as hard, because you'll be fighting two things at once. Spend a few evenings here first
and the rest of the repo will feel much easier.

**The rule of thumb:** for each topic below, read the *self-check*. If you can honestly say
"yes, I can do that", skip the topic. You don't need mastery — you need "comfortable enough".

| # | Topic | Time if new | You need it for |
|---|---|---|---|
| 1 | [The terminal](#1-the-terminal-command-line) | 1–2 evenings | literally everything |
| 2 | [Git & GitHub](#2-git--github) | 1–2 evenings | cloning, pushing, triggering CI |
| 3 | [How the web works](#3-how-the-web-works-http-json-ports) | 1 evening | understanding what the APIs do |
| 4 | [A bit of JavaScript or Python](#4-a-bit-of-javascript-or-python) | ongoing | reading the app code |
| 5 | [Basic networking words](#5-basic-networking-words) | 1 evening | Docker networks, k8s Services, VPC |
| 6 | [YAML](#6-yaml) | 1 hour | every Kubernetes/compose/CircleCI file |
| 7 | [What a server actually is](#7-what-a-server-actually-is) | 1 hour | making "the cloud" concrete |

Total: roughly **one to two weeks of evenings** if everything is new — and zero if you already
work with code daily.

---

## 1. The terminal (command line)

Every single tool in this repo — `git`, `docker`, `kubectl`, `terraform`, `npm` — is used
by typing commands into a terminal. If the terminal feels scary, fix that first; it's the
highest-leverage hour you can invest.

**Know how to:**
- open a terminal, and read what the *prompt* is telling you
- move around: `pwd`, `ls`, `cd projects/school`, `cd ..`
- look at files: `cat file.txt`, `open .` (macOS)
- run a program and read its output — and its *errors*, calmly
- stop a running program with `Ctrl+C`
- understand environment variables: `export NAME=value`, `echo $NAME`
- chain the basics: `command > file.txt`, `command | grep word`

**Self-check:** *"I can open a terminal, navigate to a folder, run a command I've never seen
before, and read the error message it prints without panicking."*

**Free resources:** [MIT — The Missing Semester, lecture 1](https://missing.csail.mit.edu/2020/course-shell/) ·
[Ubuntu's command line tutorial](https://ubuntu.com/tutorials/command-line-for-beginners) (works for macOS too)

---

## 2. Git & GitHub

This repo *is* a git repository, and the whole CI/CD story starts with `git push` —
diagram 1, step 1. You don't need branching wizardry; you need the daily loop.

**Know how to:**
- `git clone` a repository
- the loop: edit files → `git status` → `git add` → `git commit -m "..."` → `git push`
- `git log` to see history, `git diff` to see what you changed
- what GitHub is (the hosted copy everyone shares) vs git (the tool on your machine)
- what a branch is, roughly — this repo mostly just uses `main`

**Self-check:** *"I can clone a repo, change a file, commit it with a sensible message, and
push it — and if push is rejected I know it's probably because the remote has newer commits."*

**Free resources:** [git book, chapters 1–2](https://git-scm.com/book/en/v2) ·
[learngitbranching.js.org](https://learngitbranching.js.org/) (interactive, genuinely fun)

---

## 3. How the web works (HTTP, JSON, ports)

The two apps in this repo are HTTP APIs. Docker maps their ports, Kubernetes health-checks
their URLs, the ALB routes their requests. If HTTP is fuzzy, all of that is fuzzy.

**Know:**
- the client/server model: a *client* (browser, `curl`) sends a **request**, a *server* sends back a **response**
- what a URL's parts mean: `http://localhost:3000/students`
- the common methods: GET (read), POST (create), DELETE — and status codes 200, 201, 404, 500
- what JSON looks like and that it's just structured text: `{"name": "Aarav", "grade": "5A"}`
- what a **port** is: one machine, many doors — the API listens on door 3000
- using `curl` to talk to an API from the terminal

**Self-check:** *"I can explain what happens when I run
`curl -X POST localhost:3000/students -d '{...}'` — which machine, which port, which method,
and what a 201 vs a 404 answer would mean."*

**Free resources:** [MDN — How the web works](https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Web_standards/How_the_web_works) ·
[MDN — HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview)

---

## 4. A bit of JavaScript or Python

The apps are deliberately tiny (~150 lines each), but you'll get much more from the project
if you can *read* them. Pick **one** language — whichever you already touched — and get to
"can read simple code" level. You don't need both, and you don't need to be able to write it
from scratch.

**Know (in your chosen language):**
- variables, functions, if/else, loops
- objects/dictionaries and arrays/lists
- roughly what `async`/`await` means: "this line waits for a slow thing (network, disk)"
- how to run a file: `node file.js` or `python3 file.py`

**Self-check:** *"I can open [apps/school-api/src/server.js](../apps/school-api/src/server.js)
or [apps/school-analytics/app/main.py](../apps/school-analytics/app/main.py) and roughly follow
what each block does, even if some syntax is new."*

**Free resources:** [javascript.info, part 1](https://javascript.info/) ·
[Python's official tutorial, ch. 1–5](https://docs.python.org/3/tutorial/)

---

## 5. Basic networking words

You don't need to be a network engineer. You need ~8 words to stop being mysterious, because
Docker, Kubernetes and the VPC diagrams all speak them.

**Know what these mean, one sentence each:**
- **IP address** — a machine's number on a network
- **localhost / 127.0.0.1** — "this machine itself"
- **port** — a numbered door on a machine
- **DNS** — the phonebook: name → IP address (this is how `db` and `school-api` work as addresses!)
- **client / server** — who asks vs who answers
- **firewall** — rules about which doors are open to whom (AWS calls these security groups)
- **public vs private network** — reachable from the internet vs not
- **load balancer** — one front door that spreads traffic across many servers

**Self-check:** *"When the compose file says the API connects to `postgres://…@db:5432`, I can
say what `db` is, what `5432` is, and why this only works inside the compose network."*

**Free resource:** [Cloudflare — What is DNS?](https://www.cloudflare.com/learning/dns/what-is-dns/) and their other "learning" articles (short and clear)

---

## 6. YAML

Kubernetes manifests, docker-compose and the CircleCI pipeline are all YAML. It's not a
programming language — it's structured text — and it takes about an hour to learn. The one
brutal rule: **indentation is meaning**, and it must be spaces, never tabs.

**Know:**
- key/value: `name: school-api`
- nesting by indentation (2 spaces in this repo)
- lists: lines starting with `- `
- strings usually don't need quotes; numbers and booleans are unquoted
- comments start with `#`

**Self-check:** *"I can open [k8s/deployment.yaml](../k8s/deployment.yaml) and correctly answer:
is `containers:` a list or a map? What is `replicas: 2` nested under?"*

**Free resource:** [Learn X in Y minutes — YAML](https://learnxinyminutes.com/docs/yaml/) (10 minutes, honestly enough)

---

## 7. What a server actually is

"The cloud" stops being magic the moment you internalize: **a server is just a computer,
usually running Linux, that you rent and reach over the network.** An EC2 "instance" is a
computer. An EKS "node" is a computer. RDS is a computer with Postgres pre-installed and
someone else doing the maintenance.

**Know:**
- a server = a computer without a screen, accessed via the network
- Linux runs almost all of them; a *process* is a running program on it
- "renting a server" (EC2) vs "renting a managed service" (RDS): the difference is who patches it
- why we automate: because clicking around one computer doesn't scale to a hundred

**Self-check:** *"When the Terraform diagram says 'EKS node = EC2 = t3.small', I understand
that's just a small rented Linux computer that will run my containers."*

**Free resource:** [Roadmap.sh — DevOps roadmap](https://roadmap.sh/devops) (for orientation — don't try to finish it, just see the map)

---

## What you do NOT need before starting

To be explicit — the following are **taught by this repo**, so don't study them in advance:

- ❌ Docker, Kubernetes, Terraform — the README + diagrams start from zero
- ❌ AWS — you'll meet VPC/EKS/ECR/RDS with pictures when you need them
- ❌ CI/CD theory — you'll watch a real pipeline do it instead
- ❌ Databases/SQL — the apps hide it; Postgres knowledge helps later, not now
- ❌ Microservices architecture — you'll *build* one and then the word will make sense

## Ready?

If the self-checks above mostly got a "yes":

1. Start with the [main README](../README.md) — read section 1 (The Big Picture) slowly.
2. Then follow [local-setup.md](local-setup.md), Level 1 → 2 → 3.
3. When a step feels magical, [under-the-hood.md](under-the-hood.md) explains what happened beneath it.

Go slow, run every command yourself, and break things on purpose — the cluster will heal. 🙂
