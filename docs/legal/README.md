# Legal drafts - Marshellis games

**DRAFTS. Not live, not legal advice.** A lawyer who handles children's privacy must review
before we collect payment, open to people outside the family, or publish these on the site.

## Where these came from
- Written fresh to match what the platform actually does (see
  `docs/superpowers/specs/2026-10-30-family-platform-design.md`), structured to cover the
  notice contents the FTC's COPPA Rule requires (16 CFR 312.4).
- Open reference we may borrow wording from: Automattic's
  [Legalmattic](https://github.com/Automattic/legalmattic) terms and privacy policy, licensed
  **CC BY-SA 4.0** - reuse is allowed if we credit it with a link and share our adapted version
  under the same license. We have not copied text yet; if we do, add the credit line below.
- Other free templates found (MIT-licensed `ryuno2525/privacy-policy-templates`, Security
  Scientist's COPPA Word template) make compliance claims we have not verified - do not rely on
  them without the lawyer.

## Options to reduce legal risk (decisions for the family)
1. **COPPA safe-harbor program** (kidSAFE, PRIVO, iKeepSafe, CARU, ESRB; roster and fees not
   confirmed - ask each for a quote). Joining means following the program's rules, reviewed by
   them, instead of going straight to FTC scrutiny.
2. **One-time lawyer review** of these two documents and the parental-consent flow.
3. Keep collecting the minimum (this is already the plan); it is the cheapest compliance.

## Compliance checklist (engineering owns these)
- [ ] Parent consent before any child profile is created (card check or signed consent step)
- [ ] Notice to parents of what is collected, why, and who sees it (the privacy policy)
- [ ] Parent can view, export and delete a child's data; deletion is real (not hidden)
- [ ] No ads, no behavioural tracking, no third-party analytics in kid-facing pages
- [ ] Data kept only as long as needed; retention schedule written down
- [ ] Written information-security program (access, backups, incident response)
- [ ] Third parties (hosting, payments) listed; contracts/terms checked
- [ ] Cancel a subscription in one step, with confirmation email; refund terms stated
