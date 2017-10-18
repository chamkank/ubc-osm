const fs = require('fs');
const ini = require('ini');
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const passport = require('passport')
const GitHubStrategy = require('passport-github2').Strategy;
const partials = require('express-partials');
const mongodb = require('mongodb');
var Promise = require('promise');
var request = require('request');
var cron = require('node-cron');

var db;
const app = express();
const MongoClient = mongodb.MongoClient;

// === Get details from config.ini ====
var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
MONGODB_URI = config.database.uri;
GITHUB_CLIENT_ID = config.github.id;
GITHUB_CLIENT_SECRET = config.github.secret;
CALLBACK_URL = config.github.CALLBACK_URL;
PASSPORT_SECRET = config.passport.secret;
PORT = config.server.port;

// === Connect to database ===
MongoClient.connect(MONGODB_URI, (err, database) => {
  if (err) return console.log(err)
  db = database
  app.listen(PORT, () => {
    console.log('Listening on port', PORT)
  })
})

// =========================
//      AUTHENTICATION
//          SETUP
// =========================

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(
  new GitHubStrategy({
  clientID: GITHUB_CLIENT_ID,
  clientSecret: GITHUB_CLIENT_SECRET,
  callbackURL: CALLBACK_URL
  }, function(accessToken, refreshToken, profile, done) {
  process.nextTick(function () {
    // === This is where user is stored into database ===
    // First we make sure user isn't in database already (to avoid duplicate entries).
    // We use GitHub ID instead of username because ID is constant while username can be changed
    db.collection('users').findOne( { "id": profile.id}, (err, result) => {
      if (err) return console.log("DID NOT FIND USER")
      if (result){
        return done(null, profile); // if user was found in database, we return and don't add them again (this won't actually be called, but is just a fail-safe)
      } else { // If user not found in database, we add them to it
        db.collection('users').save(profile, (err, result) => {
          if (err) return console.log(err)
          console.log('Saved new user to database');
        })
        // Add additional fields (leaderboard_count, deactivated, pull_request_list)
        db.collection('users').update( {"id":profile.id}, {$set : {"leaderboard_count":0, "deactivated":0, "pull_request_list":[]}} );
        try {
          updateLeaderboard("2017-10"); // Update leaderboard upon new user joining the competition
        } catch(e){
          console.log(e);
        }
        return done(null, profile);
      }
    })
  })
}))


// Configure Express & Passport
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride());
app.use(session({ secret: PASSPORT_SECRET, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session()); // for persistent login sessions
app.use(express.static(__dirname + '/public'));


// =========================
//         ROUTES
// =========================

// Route for homepage
app.get('/', function(req, res){
  // Retrieve users from database that are not deactivated
  // updateSchoolCount();
  db.collection('users').find({"id":{$exists:true}, "deactivated":{$nin:[1]}}, {displayName:1, username:1, leaderboard_count:1, _id:0, school:1, avatar_url:1}).toArray(function(err, results) {
    if (err) return console.log(err);

    // get schools with leaderboard_count
    db.collection('schools').find().toArray(function(err, list_of_schools) {
      results.sort(sortLeaderboard); // sort users from highest score to lowest score
      if (err) return console.log(err);
      res.render('index', { user: req.user, leaderboard_users: results, schools: list_of_schools });
    })

  })
});

// Route for account page
app.get('/account', ensureAuthenticated, function(req, res){
  // retrieve selected fields of current user from database
  db.collection('users').find({"id":{$eq:req.user.id}},{pull_request_list:1, _id:0, deactivated:1, school:1, email:1}).toArray(function(err, results) {
    pull_request_list = results[0]["pull_request_list"];
    user_email = results[0].email
    user_school = results[0].school
    res.render('account', { user: req.user, pull_requests: pull_request_list, deactivated: results[0].deactivated, school: user_school, email: user_email});
  })
});

// Route for login
app.get('/login', function(req, res){
  res.redirect('/auth/github');
});

// Route for updating email and school
app.post('/set_details', ensureAuthenticated, function(req, res){
  var email = req.body["email"]
  var school = req.body["school"]

  // Set email field of current user
  db.collection('users').update({"id":req.user.id},{$set: {"email":email}}, function (err, res) {
    if (err) return console.log(err)
    console.log(req.user.id+" set email.");
  })

  // Set school field of current user
  db.collection('users').update({"id":req.user.id},{$set: {"school":school}}, function (err, res) {
    if (err) return console.log(err)
      console.log(req.user.id+" set school.");
  })

  // Set avatar_url field of current user
  db.collection('users').update({"id":req.user.id},{$set: {"avatar_url":"https://github.com/" + req.user.username + ".png"}}, function (err, res) {
    if (err) return console.log(err)
      console.log(req.user.id+" set avatar_url.");
  })

  res.redirect('/account')

});

// Route for deactivating account (which removes them from leaderboard)
app.get('/deactivate', ensureAuthenticated, function(req, res){
  db.collection('users').update({"id":req.user.id},{$set: {"deactivated":1}}, function (err, res) {
    if (err) return console.log(err)
    console.log(req.user.id+" deactivated account.");
  })
  res.redirect('/account');
});

// Route for activating account
app.get('/activate', ensureAuthenticated, function(req, res){
  db.collection('users').update({"id":req.user.id},{$set: {"deactivated":0}}, function (err, res) {
    if (err) return console.log(err)
    console.log(req.user.id+" activated account.");
  })
  res.redirect('/account');
});

// Route for GitHub authentication
app.get('/auth/github',
passport.authenticate('github', { scope: [ 'user:email' ] }),
function(req, res){
  // User redirected to GitHub for authentication
});

// Route for account redirect after user logs in via GitHub
app.get('/auth/github/callback',
passport.authenticate('github', { failureRedirect: '/login' }),
function(req, res) {
  res.redirect('/account');
});

// Route for logging out
app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

// =========================
//     HELPER FUNCTIONS
// =========================

// Ensures that the user is logged in (required by some of the routes above)
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}

/**
    Updates leaderboard (this function is called by the scheduler every hour, or when a new user signs up)
    Function call order: updateLeaderboard -> (makeGitHubRequest -> updateUser) -> updateSchoolCount
**/
function updateLeaderboard(date){
  // Date must loosly be in the form "year-month-day", ex: "2017-07-02","2017-07","2017", or "" for all dates
  db.collection('users').find({"id":{$exists:true}}, {username:1, leaderboard_count:1, id:1}).toArray(function(err, results) {
    if (err) return console.log("Error updating leaderboard (could not fetch users).");
    var num_users = results.length
    console.log("num_users",num_users)

    var i = 0;

    // Iterate through all users using a step function.
    function step(i){
    if (i < num_users){
      var pull_request_list = [];
      current_user = results[i].username;
      current_user_id = results[i].id;
      console.log(current_user)
      // Options for API request
      var options = {
        url: 'https://api.github.com/search/issues?q=+type%3Apr+author%3A'+current_user,
        headers: {
          'User-Agent': 'UBC Open Source Month'
        }
      };

      // Makes GitHub API request and updates user
      makeGitHubRequest(options, current_user, date, pull_request_list);
    }

    // Prevent call-stack overflow
    setTimeout(function() {
      step(i+1);
    }, 20000 ); // 20 seconds

  };
  step(0) // start the call which steps through users one by one
  })
  updateSchoolCount();
}

// Makes GitHub API request and calls updateUser function
function makeGitHubRequest(options, current_user, date, pull_request_list){
  // Make GitHub API request for current_user
  request(options, function (error, response, body) {
    try {
      if (error) return console.log(error);
      // console.log('statusCode:', response && response.statusCode);
      var pull_requests = JSON.parse(body).items
      var num_pull_requests = Object.keys(JSON.parse(body).items).length
      var count = 0 // running count of number of pull requests for current_user

      console.log("pull requests", num_pull_requests)

      avatar_url = "https://github.com/" + current_user + ".png";
      // Iterate through pull requests and add them to database
      for (j = 0; j < num_pull_requests; j++){
        current_pull_request = pull_requests[j];
        if (current_pull_request.created_at.includes(date)){
          // If pull request is in a repo that's not owned by user, add it to pull_request_list
          if (!current_pull_request.pull_request.url.includes(current_user)){
            count+=1;
            // avatar_url = current_pull_request.user.avatar_url;
            pull_request_list.push({"title":current_pull_request.title, "html_url":current_pull_request.html_url, "api_url":current_pull_request.url, "date":current_pull_request.created_at});
          }
        }
      }

      updateUser(current_user, current_user_id, count, pull_request_list, avatar_url)

    } catch (e) {
      console.log(e);
      return;
    }
  });
}

// Updates user's leaderboard_count and pull_request_list
function updateUser(current_user, current_user_id, count, pull_request_list, avatar_url){
  db.collection('users').update({"id":current_user_id},{$set: {"leaderboard_count":count, "avatar_url":avatar_url}}, function (err, res) {
    if (err) return console.log(err)
    console.log("Updated "+current_user+"'s leaderboard score.");
  })

  // Update users pull_request_list.
  db.collection('users').update({"id":current_user_id},{$set: {"pull_request_list":pull_request_list}}, function (err, res) {
    if (err) return console.log(err)
    console.log("Updated "+current_user+"'s pull_request_list.");
  })
}

// Updates the score of all schools
function updateSchoolCount(){
  db.collection('users').find({"id":{$exists:true}}, {leaderboard_count:1, school:1, deactivated:1}).toArray(function(err, results) {
    if (err) return console.log("Error updating schools (could not fetch users).");

    var num_users = results.length
    var UBC_count = 0;
    var SFU_count = 0
    var UVIC_count= 0
    var BCIT_count = 0

    for (var i = 0; i < num_users; i++){
      if (results[i].deactivated == 1) continue // do not count deactivated users
      current_count = results[i].leaderboard_count;
      current_school = results[i].school;
      switch (current_school) {
        case "UBC":
          UBC_count += current_count
          break;
        case "SFU":
          SFU_count += current_count
          break;
        case "UVIC":
          UVIC_count += current_count
          break;
        case "BCIT":
          BCIT_count += current_count
          break;
      }
    }
    console.log(UBC_count, SFU_count, UVIC_count, BCIT_count)

    // update UBC's leaderboard_count
    db.collection('schools').update({"school":"UBC"},{$set: {"leaderboard_count":UBC_count}}, function (err, res) {
      if (err) return console.log(err)
      console.log("Updated UBC's leaderboard score.");
    })

    // update SFU's leaderboard_count
    db.collection('schools').update({"school":"SFU"},{$set: {"leaderboard_count":SFU_count}}, function (err, res) {
      if (err) return console.log(err)
      console.log("Updated SFU's leaderboard score.");
    })

    // update UVIC's leaderboard_count
    db.collection('schools').update({"school":"UVIC"},{$set: {"leaderboard_count":UVIC_count}}, function (err, res) {
      if (err) return console.log(err)
      console.log("Updated UVIC's leaderboard score.");
    })

    // update BCIT's leaderboard_count
    db.collection('schools').update({"school":"BCIT"},{$set: {"leaderboard_count":BCIT_count}}, function (err, res) {
      if (err) return console.log(err)
      console.log("Updated BCIT's leaderboard score.");
    })

  })
}

// Automatic Scheduler (updates leaderboard occasionally)
cron.schedule('* 1 * * *', function(){
  // updates leaderboard every hour
  console.log('Scheduler running.');
  updateLeaderboard("2017-10");
});

// Helper function for sorting leaderboard (sorts by highest score)
function sortLeaderboard(a, b){
  return -1*(a["leaderboard_count"] - b["leaderboard_count"]);
}
