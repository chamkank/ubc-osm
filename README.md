# ubc-osm
UBC Open Source Month Leaderboard

## Setup
Create a config.ini file in the root directory with the following values (sample values provided) and then run `npm install && npm run`.

```
[database]
uri=mongodb://<user>:<pass>@url.com:port

[server]
port=80

[github]
id=<github-api-id>
secret=<github-api-secret>
callback_URL=<callback-url>

[passport]
secret=<secret-string-for-passport>
```
