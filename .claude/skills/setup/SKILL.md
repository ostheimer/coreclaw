# CoreClaw Setup Skill

This skill is invoked when the user runs `/setup` in Claude Code.

## Steps

1. **Check Node.js version**
   - Require Node.js 22+
   - If not met, instruct user to install via `nvm install 22`

2. **Check Docker**
   - Verify Docker daemon is running
   - If not, instruct to start Docker Desktop

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Copy environment file**
   ```bash
   cp .env.example .env
   ```
   Then prompt user to fill in `ANTHROPIC_API_KEY`.

5. **Build TypeScript**
   ```bash
   npm run build
   ```

6. **Build agent container**
   ```bash
   npm run docker:build
   ```

7. **Run tests**
   ```bash
   npm test
   ```

8. **Verify setup**
   - Confirm all steps passed
   - Inform user that `npm run dev` starts the system

## On Failure

- Clearly state which step failed
- Provide actionable fix instructions
- Suggest checking logs or opening an issue
