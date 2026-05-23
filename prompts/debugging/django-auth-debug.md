# Purpose
Debug Django + DRF JWT authentication issues. Specifically: race conditions, token refresh loops, middleware order, WebSocket auth.

# Prompt Template
You are a Django principal engineer. Debug this auth issue.

## Context
**Stack**: Django 5.0, DRF, djangorestframework-simplejwt, Redis, Channels
**Error**:
```
<paste full traceback here>
```

**Recent changes**:
```
<paste git diff or describe what changed>
```

**Expected behavior**: User logs in, access token works for 15min, refresh works once
**Actual behavior**: <describe what happens>

**Relevant code**:
```python
# settings.py MIDDLEWARE
<paste middleware>

# consumers.py or views.py
<paste failing code>
```

## Your Task
1. List 3 hypotheses ranked by probability. Focus on: middleware order, token blacklist, WS scope auth, Redis race
2. Give 1 command to test the #1 hypothesis immediately
3. Show the fix with exact file:line and code diff
4. Prevention: What check should I add to prevent this class of bug?
5. Be terse. No intro. Start with "## Hypothesis"

## Best Results
- GPT-5: Best for reasoning through middleware chains
- Claude Opus: Best for long tracebacks + code context
- Gemini 2.5 Pro: Best when you paste 3+ files

## Notes
- Works best if you include SIMPLE_JWT settings
- If WebSocket issue, include AuthMiddlewareStack setup
- If "token_not_valid" loop, 80% chance it's clock skew or blacklist not cleared

## Real Example That Worked
**Issue**: Token refresh worked in Postman, failed in React app
**Root cause**: ACCESS_TOKEN_LIFETIME was 5s in dev .env override
**Fix**: Added `print(settings.SIMPLE_JWT)` to middleware to catch env bugs
**Prevention**: Added to /memory/mistakes/env-override-silent-fail.md
