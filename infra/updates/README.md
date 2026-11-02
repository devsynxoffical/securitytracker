# Updates folder

Served as `https://updates.<DOMAIN>/` and `https://admin.<DOMAIN>/downloads/`.

```text
latest.json                      manifest read by the install page
releases/<version>/WorkPulse-*   installers, checksums, latest.json of that version
```

Filled by `.github/workflows/release-desktop.yml` when `UPDATES_SSH_*` secrets exist, or by copying a GitHub Release here by hand (see docs/19 section 9).
