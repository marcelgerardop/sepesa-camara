# Cámara SEPESA

[![CI](https://github.com/marcelgerardop/sepesa-camara/actions/workflows/ci.yml/badge.svg)](https://github.com/marcelgerardop/sepesa-camara/actions/workflows/ci.yml)

Phone camera for [camara.sepesa.com.ve](https://camara.sepesa.com.ve). It uses the device camera, burns the SEPESA logo and the Caracas time into the photo or video, and lets the person download or share the file. Nothing is uploaded.

## Work on it

Needs Node 22 or newer.

```
npm ci
npm run dev     # local server; the camera needs localhost or https
npm test        # crop, format and time maths
npm run build   # type check, then build into dist/
```

## How it gets published

The site is the Cloudflare Pages project `sepesa-camara`.

Every push and pull request runs the tests and the build (`.github/workflows/ci.yml`). A push to `main` that passes is then uploaded to Cloudflare Pages, and the workflow checks that camara.sepesa.com.ve serves the new build.

The upload needs two repository secrets (Settings → Secrets and variables → Actions):

| Secret | What it is |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with the **Cloudflare Pages: Edit** permission on the account |
| `CLOUDFLARE_ACCOUNT_ID` | The account ID shown on the Cloudflare dashboard |

To publish by hand instead:

```
npm run build
npx wrangler login
npx wrangler pages deploy dist --project-name=sepesa-camara --branch=main
```
