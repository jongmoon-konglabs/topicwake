# UI guidelines

The primary task is **find a topic → select it → read its data**. Keep network details secondary and avoid decorative metrics or explanatory copy in the main workspace.

## Layout

- Use the standard macOS title bar. The desktop UI does not repeat a large product header.
- Default window: 1280 × 800. Keep the centered workspace within 90 rem.
- At 1100 px and wider, show a small network information rail beside the topic list and data pane.
- Between 900 and 1099 px, collapse network information while keeping list and data side by side.
- Below 900 px, open details in the same workspace and provide a clear return to the list.
- Keep search and sort controls above the independently scrolling topic list.

## Visual language

Use the Astryx-based Observatory theme: cool neutral surfaces, dark readable text, and muted blue for selection. Green and red indicate receipt state, not selection. Select the whole row and preserve its keyboard semantics. Long keys and payloads must remain readable without expanding the page width.

Use concise English labels. Describe observed facts: no recent data is not the same as a disconnected device. Keep technical caveats in contextual help, not in every row.

## States

- Separate startup connection errors from invalid credentials and offer retry.
- Show unknown receipt state when a current observation is unavailable; do not invent activity.
- Keep the visible snapshot stable while paused or when refresh fails.
- Mark truncated previews and deletion samples explicitly.
- Hide stale topics without deleting their stored snapshot or the selected detail.

See [verification](acceptance.md) for checks and [architecture](architecture.md) for data semantics.
