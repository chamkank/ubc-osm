# BC Hacktoberfest

A web application for [BC Hacktoberfest](http://bchacktoberfest.ca/) - a month-long open source competition for students in British Columbia, hosted by [StartupStorm](http://www.startupstorm.org/), and inspired by [Hacktoberfest](hacktoberfest.digitalocean.com).

[Trello discussion thread](https://trello.com/c/eNtLkekm/1-leaderboard-with-prizes)

## Setup
Create a config.ini file in the main directory with the following values (sample values provided) and then run `npm install && npm run`.

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
