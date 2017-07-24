# ubc-osm
[UBC Open Source Month Leaderboard](http://ec2-34-203-223-167.compute-1.amazonaws.com/)

[Trello discussion thread](https://trello.com/c/eNtLkekm/1-leaderboard-with-prizes)

NOTE: Front-end is still bare, so ignore the lack of aesthetic.

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
