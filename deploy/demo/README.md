# App Review demo server

A public Yarukoto server for Apple's reviewers (and anyone else who needs to try the
app against a real server). It runs on Google Cloud's free `e2-micro`, behind Caddy
for HTTPS, and wipes and re-seeds its data every night at 3am Pacific.

Everything below runs in [Cloud Shell](https://shell.cloud.google.com), so nothing
needs installing. Pick a domain first; these steps use `demo.yarukotoapp.com`.

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

Add an `A` record for `demo.yarukotoapp.com` pointing at that address. Caddy can only get a
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
  --metadata=demo-domain=demo.yarukotoapp.com \
  --metadata-from-file=startup-script=startup.sh
```

`us-central1`, one `e2-micro` and a 30 GB *standard* disk are what keep it free; a
balanced or SSD disk is billed.

The first boot installs Docker, pulls the image and seeds the data, which takes a few
minutes. Then `https://demo.yarukotoapp.com/api/v1/health` answers.

## 4. The sign-in for App Review

The server has two tokens. Reviewers get the **reviewer** one: it signs in as
"App Reviewer", an ordinary household member, so **Settings › Account › Delete my
account** works for real. The owner token can't delete its account (it erases the whole
server instead), so keep that one to yourself.

```sh
gcloud compute ssh yarukoto-demo --zone=us-central1-a \
  --command='sudo grep YARUKOTO_REVIEWER_TOKEN /opt/yarukoto-demo/.env'
```

In App Store Connect's review notes (and Play Console's App access), give the server
URL and that token, and say: on the first screen choose **Use an access token**, enter
both, and tap **Connect**. Add that the reviewer account can be deleted from Settings ›
Account, and is recreated every night. "Explore with sample data" also works with no
server at all.

A VM set up before the reviewer existed needs the new startup script first, because the
VM keeps the copy it was created with (only the other files are fetched fresh):

```sh
curl -fsSLO https://raw.githubusercontent.com/wyne/yarukoto/main/deploy/demo/startup.sh
gcloud compute instances add-metadata yarukoto-demo --zone=us-central1-a \
  --metadata-from-file=startup-script=startup.sh
gcloud compute ssh yarukoto-demo --zone=us-central1-a \
  --command='sudo google_metadata_script_runner startup'
```

That adds the token and re-seeds the data once.

## Looking after it

- **Reset now:** `sudo /opt/yarukoto-demo/reset.sh` on the VM. It also pulls the
  latest server image, as the nightly run does.
- **Logs:** `/var/log/yarukoto-demo-reset.log`, and `docker compose logs` in
  `/opt/yarukoto-demo`.
- **New tokens:** delete `/opt/yarukoto-demo/.env`, re-run the startup script with
  `sudo google_metadata_script_runner startup`, and update the review notes.
- The startup script fetches the other files from `main` on every boot, so changes to
  them reach the VM on its next restart. Changes to `startup.sh` itself need the
  `add-metadata` step above.
