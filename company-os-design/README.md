# Company OS - UI Design Package

- `DESIGN-SYSTEM.md` : colours, typography, spacing, components, states
- `SCREENS.md` : all 56 screens with image, purpose, elements, actions, states, references
- `png/` : design images
- `html/` : source HTML and CSS of every image (give to the AI model with the image)

Prompt pattern for an AI coding model:

```text
Build screen <ID>. Read DESIGN-SYSTEM.md and the <ID> section in SCREENS.md.
Use png/<ID>.png and html/<ID>.html as the visual reference.
Use the shared components from packages/ui. Wire data to the endpoints
named in the screen's Actions. Implement loading, empty and error states.
```
