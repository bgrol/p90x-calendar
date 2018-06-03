/**
 * p90xCalMaker is a tool to create p90x calendar routines in Google calendar
 * and a way to adjust the schedule easily.\
 * Author: Benjamin Grol, bengrol@gmail.com
 * 
 * Usage: [node p90xCalMaker.js 0] starts a new p90x classic regime starting today
 * Usage: [node p90xCalMaker.js clear] deletes all calendar events from tomorrow onwards
 * Usage: [node p90xCalMaker.js 29] starts the p90x classic regime from day 29 (counting from 0)
 * Typical workflow: I miss a workout, I run clear, I restart the sequence as needed
 * 
 */

var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/calendar-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/calendar'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
		 process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'calendar-nodejs-quickstart.json';

// String values for calendar entries
var p90xPrefix = 'P90XD';

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
	if (err) {
	    console.log('Error loading client secret file: ' + err);
	    return;
	}
	// Authorize a client with the loaded credentials, then call the
	// Google Calendar API.
	//TODO: figure out how far back to delete p90x cal events
	
	// Extract first argument passed to script
	var arg = process.argv.slice(2); 

	// If first arg is 'clean', run the clean action, if it's a number, create 
	// the calendar based on the argument.
	if(arg == 'clean') {
	    authorize(JSON.parse(content), cleanUpP90XEvents);
	} else if (typeof Number(arg) == 'number') {
		authorize(JSON.parse(content), createP90xClassicOrderCalendar.bind(null, Number(arg)));
	}
});

function createP90xClassicOrderCalendar(startDay, auth){

    // This will be an array of all 9X workout names, in order, for p90x classic
    var p90xWorkoutNames = [];
	// This is the p90x classic plan. 
    p90xWorkoutNames.pushArray(phase1coreweek);
    p90xWorkoutNames.pushArray(phase1coreweek);
    p90xWorkoutNames.pushArray(phase1coreweek);
    p90xWorkoutNames.pushArray(separatorweek);
    p90xWorkoutNames.pushArray(phase2coreweek);
    p90xWorkoutNames.pushArray(phase2coreweek);
    p90xWorkoutNames.pushArray(phase2coreweek);
    p90xWorkoutNames.pushArray(separatorweek);
    p90xWorkoutNames.pushArray(phase1coreweek);
    p90xWorkoutNames.pushArray(phase1coreweek);
    p90xWorkoutNames.pushArray(phase2coreweek);
    p90xWorkoutNames.pushArray(phase2coreweek);
    p90xWorkoutNames.pushArray(separatorweek);

    // Having some fun starting the workout from day 0. #nerd
    for(var i = 0; i<p90xWorkoutNames.length; i++){
	p90xWorkoutNames[i] = p90xPrefix + i + ' ' + p90xWorkoutNames[i];
    }
    
    var cursorDate = new Date();

    var i = startDay;
	
	// I'm sure this isn't great design, but using a recursive call with a timer to rate-limit
	// the GCal API calls, which were failing quite often
	createEvent = function(){
		//console.log('in the createEvent function');
		if(i < p90xWorkoutNames.length){
			// set up the date component for the new event
			var dateString = cursorDate.toISOString();
			dateString = dateString.substr(0,10);	
			
			//Create the var for the new event
			var workoutEvent = {
		    	'summary':p90xWorkoutNames[i],
		    	'start':{
					'date':dateString,
					'timeZone':'Etc/Zulu'
		    	},
		    	'end':{
					'date':dateString,
					'timeZone':'Etc/Zulu'
				}
			}
			
			//Create the new event in Google Calendar
			var calendar = google.calendar('v3');
			var request = calendar.events.insert({
				'auth':auth,
				'calendarId':'primary',
				'resource': workoutEvent
			}, function(err, response) {
				if (err) {
					console.log('The API returned an error: ' + err);
					return;
		    	}
				console.log('Created a new p90x workout ' + workoutEvent.summary);
				var output = '';
		 	   for (var property in response){
				   output += property + ': ' + response[property]+'; ';
		 	   }
			});
			
			//increment the date and the counter by 1
			i++;
			cursorDate.setDate(cursorDate.getDate() + 1);
			//create the next event, after a delay
			setTimeout(createEvent, 500);
		}
	}
	createEvent();
	return; //do we need this?
}

/**
 * This function deletes p90x events up to N days back
 */
function cleanUpP90XEvents(auth){
    var calendar = google.calendar('v3');

    //how far back to do the clean-up. Currently set for 120 days back
    var currentDate = new Date();
    var startDate = new Date();
	//TODO: make sure this date is going back where I think it is. Saw some quirky behavior before.
	//TODO: decide if we want this to actually go backwards. Might be nice to see old workouts.
	//TODO: consider putting in -1 to capture "today"
    startDate.setDate(currentDate.getDate());

    //console.log('the current date is: '+ currentDate.toISOString());
    //console.log('the start date is: '+ startDate.toISOString());

    calendar.events.list(
		{
	    	auth:auth,
	    	calendarId: 'primary',
	    	timeMin:startDate.toISOString(), //arbitrarily set to 120, will investigate sizing later
	    	maxResults: 400, //TODO:randomly big number, will investigate sizing this later
	    	singleEvents: true,
	    	orderBy: 'startTime'
		},
		function(err, response)
		{
	 	   if (err) {
			   console.log('The API returned an error: ' + err); return;
		   }
		   	// Set up data and indexes for recursive loop
	  		var events = response.items;
	   		var i = 0;
			
		   	//Function for rate-limiting calls to GCal API
		   	deleteEvents = function(){ 
				//console.log('entering the deleteEvents function');
		   		var event = events[i];
				if(i++ < events.length) {
					// Check that the event summary is truthy
					if(event.summary){
						//console.log('the event summary is: ' + event.summary);
						//Check if event summary matches the p90x prefix
						if(event.summary.startsWith(p90xPrefix)){
							// Checking that event summary
							console.log('found a p90x event' + event.summary);
						
							// create the var for deletion
							var targetEventForDeletion = {
								auth: auth,
								calendarId: 'primary',
								eventId: event.id	
							}
						
							// delete the p90x event by eventId
							calendar.events.delete(targetEventForDeletion,
								function(err){
									if(err){
										console.log('The API returned an error' + err);
										return;
									}
									console.log('just deleted: ' + event.summary);
								});
							}
						}
					//anything else to increment?
					setTimeout(deleteEvents, 300);
		 		}
			} // end of function block
		   	deleteEvents();
			//TODO:consider invoking the create calendar method here, trying to ensure all 
			//prev events where deleted.
		   	return;
	  	 });
}

function timeOut(){
	console.log('timeout firing');
}
// Making it easier to add data to an array type
Array.prototype.pushArray = function(arr) {
    this.push.apply(this, arr);
};

function testEventCreation(auth){

    var testEvent = {
	'summary':'P90XD15 Chest and Back',
	'start':{
	    'date':'2017-01-08',
	    'timeZone':'Etc/Zulu'
	},
	'end':{
	    'date':'2017-01-08',
	    'timeZone':'Etc/Zulu'
	}
    }

    var calendar = google.calendar('v3');
    var request = calendar.events.insert({
	'auth':auth,
	'calendarId':'primary',
	'resource': testEvent
    }, function(err, response) {
	    if (err) {
		console.log('The API returned an error: ' + err);
		return;
	    }
	console.log('Event insert success!');
	var output = '';
	for (var property in response){
	    output += property + ': ' + response[property]+'; ';
	}
	//console.log(output);
    }
					);
}

function testEventDeletion(auth){
    //search through many events, find any that start with p90x and save them to a list. Then delete them.
    var calendar = google.calendar('v3');
    calendar.events.list({
	    auth: auth,
		calendarId: 'primary',
	           //timeMin: (new Date()).toISOString(),
	timeMin: '2017-01-06T09:42:34.521Z',
		maxResults: 10,
		singleEvents: true,
		orderBy: 'startTime'
		}, function(err, response) {
		    if (err) {console.log('The API returned an error: ' + err); return;}
		    //console.log('the date format we want is '+ new Date().toISOString());
		    var events = response.items;
		    for (var i = 0; i < events.length; i++) {
			var event = events[i];
			var start = event.start.dateTime || event.start.date;
			console.log('%s - %s', start, event.summary);
			if(event.summary.startsWith('p90x')){

			    console.log('=====WE FOUND A P90X======');
			    console.log('Trying to delete it');
			    
			    var targetEvent = {
				auth: auth,
				calendarId: 'primary',
				eventId: event.id
			    };
			    
			    calendar.events.delete(targetEvent, function(err){
				if (err) {
				    console.log('The API returned an error: ' + err);
				    return;
				}
				console.log('Event deleted');
			    });
			    
			    
			}    
		    }
		});   
}

/**
 * Lists the next 10 events on the user's primary calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listEvents(auth) {
    var calendar = google.calendar('v3');
    calendar.events.list({
	    auth: auth,
		calendarId: 'primary',
		timeMin: (new Date()).toISOString(),
		maxResults: 10,
		singleEvents: true,
		orderBy: 'startTime'
		}, function(err, response) {
	    if (err) {
		console.log('The API returned an error: ' + err);
		return;
	    }
	    var events = response.items;
	    if (events.length == 0) {
		console.log('No upcoming events found.');
	    } else {
		console.log('Upcoming 10 events:');
		for (var i = 0; i < events.length; i++) {
		    var event = events[i];
		    var start = event.start.dateTime || event.start.date;
		    console.log('%s - %s', start, event.summary);
		}
	    }
	});
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
	    if (err) {
		getNewToken(oauth2Client, callback);
	    } else {
		oauth2Client.credentials = JSON.parse(token);
		callback(oauth2Client);
	    }
	});
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
	    access_type: 'offline',
	    scope: SCOPES
	});
    console.log('Authorize this app by visiting this url: ', authUrl);
    var rl = readline.createInterface({
	    input: process.stdin,
	    output: process.stdout
	});
    rl.question('Enter the code from that page here: ', function(code) {
	    rl.close();
	    oauth2Client.getToken(code, function(err, token) {
		    if (err) {
			console.log('Error while trying to retrieve access token', err);
			return;
		    }
		    oauth2Client.credentials = token;
		    storeToken(token);
		    callback(oauth2Client);
		});
	});
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
	fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
	if (err.code != 'EEXIST') {
	    throw err;
	}
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to ' + TOKEN_PATH);
}

var phase1coreweek = [
    "Chest & Back, Ab Ripper X",
    "Plyometrics",
    "Shoulders & Arms, Ab Ripper X",
    "Yoga X",
    "Legs & Back, Ab Ripper X",
    "Kenpo X",
    "Rest or X Stretch"
];

var separatorweek = [
    "Yoga X",
    "Core Synergistics",
    "Kenpo X",
    "X Stretch",
    "Core Synergistics",
    "Yoga X",
    "Rest or X Stretch"
];

var phase2coreweek = [
    "Chest, Shoulders & Triceps, Ab Ripper X",
    "Plyometrics",
    "Back & Biceps, Ab Ripper X",
    "Yoga X",
    "Legs & Back, Ab Ripper X",
    "Kenpo X",
    "Rest or X Stretch"
];
