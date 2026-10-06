/** What the sample agent writes when it is asked to make something, so the file cards have a page to show. */
export const sampleBrief = `# Launch brief

A one-page summary of what we are launching and why.

## What we are making
A calm, confident landing page for **Harbor**, a small team workspace where the agent does the busywork.

## Principles
- Lots of white space
- One accent colour, used sparingly
- Short copy: if a sentence needs a second read, cut it

## Next steps
| Step | Owner | When |
| --- | --- | --- |
| Agree the headline | Team | Monday |
| First pass at the page | Agent | Tuesday |
| Review | Team | Wednesday |
`;

export const samplePage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Harbor</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #031D44; background: #f6fafb; }
  header { display: flex; justify-content: space-between; padding: 18px 28px; }
  .logo { font-weight: 700; color: #298097; }
  nav a { margin-left: 18px; color: inherit; text-decoration: none; }
  main { padding: 24px 28px 40px; max-width: 560px; }
  h1 { font-size: 38px; line-height: 1.1; margin: 0 0 10px; }
  button { background: #298097; color: #fff; border: 0; border-radius: 10px; padding: 11px 18px; font-size: 16px; cursor: pointer; }
  p.note { color: #5d6870; font-size: 14px; }
</style>
</head>
<body>
  <header><span class="logo">Harbor</span><nav><a href="#">Product</a><a href="#">Pricing</a></nav></header>
  <main>
    <h1>Work that feels calm.</h1>
    <p>A small team workspace where the agent does the busywork.</p>
    <button id="cta">Get started</button>
    <p class="note" id="note">This page runs in a sandbox. Try the button.</p>
  </main>
  <script>
    document.getElementById("cta").addEventListener("click", function () {
      document.getElementById("note").textContent = "Thanks! Nothing was sent anywhere.";
    });
  </script>
</body>
</html>
`;
