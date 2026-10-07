# App Review demo server

A public Yarukoto server for Apple's reviewers (and anyone else who needs to try the
app against a real server). It runs on Google Cloud's free `e2-micro`, behind Caddy
for HTTPS, and wipes and re-seeds its data every night at 3am Pacific.

Everything below runs in [Cloud Shell](https://shell.cloud.google.com), so nothing
needs installing. Pick a domain first; these steps use `demo.wyne.us`.

## 1. Project

Create a project in the Google Cloud console and attach a billing account. The free
tier still needs one on file, though this setup stays inside it. Then:

```sh
gcloud config set project YOUR_PROJECT_ID
gcloud services enable compute.googleapis.com
```

Optional but worth it: **Billing → Budgets & alerts**, a $1 budget.

## 2. Address and DNS

```sh
gcloud compute addresses create yarukoto-demo --region=us-central1
gcloud compute addresses describe yarukoto-demo --region=us-central1 --format='value(address)'
```

Add an `A` record for `demo.wyne.us` pointing at that address. Caddy can only get a
certificate once it resolves.

## 3. The VM

```sh
curl -fsSLO https://raw.githubusercontent.com/wyne/yarukoto/main/deploy/demo/startup.sh

gcloud compute firewall-rules create yarukoto-demo-web \
  --allow=tcp:80,tcp:443 --target-tags=yarukoto-demo

gcloud compute instances create yarukoto-demo \
  --zone=us-central1-a --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --address=yarukoto-demo --tags=yarukoto-demo \
  --metadata=demo-domain=demo.wyne.us \
  --metadata-from-file=startup-script=startup.sh
```

`us-central1`, one `e2-micro` and a 30 GB *standard* disk are what keep it free; a
balanced or SSD disk is billed.

The first boot installs Docker, pulls the image and seeds the data, which takes a few
minutes. Then `https://demo.wyne.us/api/v1/health` answers.

## 4. The token for App Review

```sh
gcloud compute ssh yarukoto-demo --zone=us-central1-a \
  --command='sudo grep YARUKOTO_TOKEN /opt/yarukoto-demo/.env'
```

In App Store Connect's review notes, give the server URL and that token, and say: on
the first screen choose **Use an access token**, enter both, and tap **Connect**.
"Explore with sample data" also works with no server at all.

## Looking after it

- **Reset now:** `sudo /opt/yarukoto-demo/reset.sh` on the VM. It also pulls the
  latest server image, as the nightly run does.
- **Logs:** `/var/log/yarukoto-demo-reset.log`, and `docker compose logs` in
  `/opt/yarukoto-demo`.
- **New token:** delete `/opt/yarukoto-demo/.env`, re-run the startup script with
  `sudo google_metadata_script_runner startup`, and update the review notes.
- The startup script fetches these files from `main` on every boot, so changes here
  reach the VM on its next restart.
