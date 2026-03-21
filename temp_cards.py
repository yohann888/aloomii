cards = [
    {
        "slug": "the-two-hour-founder-gtm-without-becoming-your-own-marketing-department",
        "title": "The 2-Hour Founder: How to Run a Real GTM Without Becoming Your Own Marketing Department",
        "cat": "Industry Playbooks", "cat_cls": "category-pill--industry", "date": "March 22, 2026", "read": "8 min",
        "meta": "Most founders spend 12+ hours a week on GTM and have almost nothing to show for it. Here is the math on what actually needs your time, what does not, and how to build a system that runs without you in it."
    },
    {
        "slug": "what-happens-to-your-pipeline-when-you-stop-posting",
        "title": "What Happens to Your Pipeline When You Stop Posting for Two Weeks",
        "cat": "Content Intelligence", "cat_cls": "category-pill--content-intel", "date": "March 22, 2026", "read": "6 min",
        "meta": "Every founder has done it. Two weeks of silence on LinkedIn. Then the panic when inbound slows down. Here is why consistency beats quality in founder content, and what the data says about the cost of going dark."
    },
    {
        "slug": "chatgpt-didnt-replace-your-marketing-team",
        "title": "ChatGPT Did Not Replace Your Marketing Team. Here Is What Actually Will.",
        "cat": "Comparisons", "cat_cls": "category-pill--comparisons", "date": "March 22, 2026", "read": "8 min",
        "meta": "Most founders tried ChatGPT for content, got generic output, and concluded AI does not work for GTM. The problem was not the AI. It was the architecture. Here is what a working AI-powered GTM system actually looks like."
    },
    {
        "slug": "founders-honest-guide-ai-gtm-without-sounding-like-robot",
        "title": "The Founder's Honest Guide to Using AI for GTM Without Sounding Like a Robot",
        "cat": "AI Sales System", "cat_cls": "category-pill--ai-sales", "date": "March 22, 2026", "read": "7 min",
        "meta": "Every founder who has tried AI for content has hit the same wall: the output sounds fake. Here is why it happens and how to use AI in a way that makes your GTM more consistent without making you sound like a LinkedIn bot."
    },
    {
        "slug": "humans-for-judgment-machines-for-volume-gtm-framework",
        "title": "Humans for Judgment, Machines for Volume: The Only GTM Framework That Scales at Seed Stage",
        "cat": "Industry Playbooks", "cat_cls": "category-pill--industry", "date": "March 22, 2026", "read": "8 min",
        "meta": "The founders who have cracked GTM at seed stage all run the same architecture: machines handle volume and consistency, humans handle judgment and taste. Here is how to build it."
    },
    {
        "slug": "linkedin-screaming-into-void-operator-mode-founders",
        "title": "Why Your LinkedIn Feels Like Screaming Into a Void (And What Operator-Mode Founders Do Differently)",
        "cat": "Content Intelligence", "cat_cls": "category-pill--content-intel", "date": "March 23, 2026", "read": "7 min",
        "meta": "You post on LinkedIn. A few likes from colleagues, nothing from prospects. It feels pointless. Here is why most founder LinkedIn content fails to generate pipeline, and what the founders who do generate pipeline do differently."
    },
    {
        "slug": "podcast-appearance-into-30-days-pipeline",
        "title": "How to Turn One Podcast Appearance Into 30 Days of Pipeline",
        "cat": "Content Intelligence", "cat_cls": "category-pill--content-intel", "date": "March 23, 2026", "read": "7 min",
        "meta": "Most founders do a podcast, see a small spike in traffic, and move on. The founders generating real pipeline from podcasts treat each appearance as a 30-day campaign, not a one-day event. Here is the playbook."
    },
    {
        "slug": "partnership-playbook-founders-without-bd-team",
        "title": "The Partnership Playbook for Founders Who Do Not Have a BD Team",
        "cat": "Industry Playbooks", "cat_cls": "category-pill--industry", "date": "March 23, 2026", "read": "8 min",
        "meta": "Most founders know partnerships could accelerate their growth. Most founders never build them because they do not have a BD team and do not know where to start. Here is a practical system for identifying and pursuing the right partnerships without a dedicated hire."
    },
    {
        "slug": "gtm-stack-what-founders-50k-mrr-actually-use",
        "title": "The GTM Stack Nobody Talks About: What Founders at $50K MRR Actually Use",
        "cat": "Industry Playbooks", "cat_cls": "category-pill--industry", "date": "March 24, 2026", "read": "7 min",
        "meta": "Not the aspirational stack. The actual one. What B2B founders at $10K-$100K MRR are actually using for content, outreach, signal monitoring, and competitive intelligence. And what most of them wish they had figured out sooner."
    },
    {
        "slug": "real-cost-ill-do-marketing-when-i-have-time",
        "title": "The Real Cost of \"I'll Do Marketing When I Have Time\"",
        "cat": "Industry Playbooks", "cat_cls": "category-pill--industry", "date": "March 24, 2026", "read": "6 min",
        "meta": "Every bootstrapped founder has said it. \"I will focus on GTM once the product is stable.\" Six months later, pipeline is thin and competitors have compounded. Here is the actual cost of waiting, in real numbers."
    },
    {
        "slug": "invisible-founder-invisible-company-b2b-buyers",
        "title": "Invisible Founder, Invisible Company: Why B2B Buyers Choose the Brand They Have Already Heard Of",
        "cat": "Content Intelligence", "cat_cls": "category-pill--content-intel", "date": "March 24, 2026", "read": "7 min",
        "meta": "In B2B sales, deals rarely go to the best product. They go to the most familiar name. Here is why founder visibility is the most underrated competitive advantage at seed stage, and how to build it."
    }
]

output = ""
for c in cards:
    output += f'<a href="/blog/{c["slug"]}" class="blog-card" data-category="{c["cat"]}">\n'
    output += f' <div class="card-meta">\n'
    output += f'  <span class="category-pill {c["cat_cls"]}"> {c["cat"]} </span>\n'
    output += f' </div>\n'
    output += f' <h2>{c["title"]}</h2>\n'
    output += f' <p>{c["meta"]}</p>\n'
    output += f' <span class="card-byline"> Yohann Calpu · {c["date"]} · {c["read"]} </span>\n'
    output += f'</a>\n'

print(output)
