// steps
// npm install request
// npm install nodemailer
// to run this program indefinitely:
// run a cron job

var fs  = require("fs");
const Console = console.Console;

// simple log file
const output = fs.createWriteStream('./stdout.log');
const errorOutput = fs.createWriteStream('./stderr.log');
// custom simple logger
const logger = new Console(output, errorOutput);

const lowestPriceFile = 'lowestPrice.txt';
const priceDataJSONFile = 'priceData.json';
const transportConfigJSONFile = 'transportConfig.json';

var nodemailer = require('nodemailer');
var transporter;
var transportConfig;

// price
var lowestPriceEver = 99999;


// function declarations
var log = function(message) {
	console.log(message);
	logger.log(message);
}


var initTransporter = function() {
	// read lowest price
	fs.readFile(transportConfigJSONFile, 'utf8', function (err, data) {
	    if (err) { 
	    	// file did not exist
	    	log("File " + transportConfigJSONFile + " did not exist! Creating with sample data...");
	    	var sampleData = '{"senderEmail":"example%40example.com", "senderPassword":"ExamplePassword", "receiverEmail":"example2%40example.com"}';
	    	fs.writeFile(transportConfigJSONFile, sampleData, function(err) {
	        	if(err) {
	            	log(err);
	        	}
	        	log("Created new file: " + transportConfigJSONFile);   
	        }); 
	        transportConfig = JSON.parse(sampleData);	
	    } else {
	    	try {
	    		transportConfig = JSON.parse(data);
	    	}
	    	catch(err2)
	    	{
	    		log("Failed to parse json data");
	    		throw err2;
	    	}
		}

		// create reusable transporter object using the default SMTP transport
		transporter = nodemailer.createTransport('smtps://' + 
			transportConfig.senderEmail + 
			':' 
			+ transportConfig.senderPassword + 
			'@smtp.gmail.com');	

		// now get the lowest price
	    readLowestPrice();
	});
}


var readLowestPrice = function() {
	// read lowest price
	fs.readFile(lowestPriceFile, 'utf8', function (err, data) {
	    if (err) { 
	    	// file did not exist
	    	log("Lowest price did not exist!");
	    	fs.writeFile(lowestPriceFile, '', function(err) {
	        	if(err) {
	            	log(err);
	        	}
	        	log("Created new file: " + lowestPriceFile);   
	        }); 	
	    } else {
	    	lowestPriceEver = parseInt(data);
	    	log("Lowest price from file: " + lowestPriceEver);
		}
	    // log prices
		logApartmentPrices();
	});
}


var logApartmentPrices = function () {
	// send a url request
	log("Logging apartment prices");
	var request = require("request");
	var urlString = "https://api.avalonbay.com/json/reply/ApartmentSearch?communityCode=CA068&min=1200&max=3400&_=1473711087244";
	request(urlString, function(error, response, body) {
		if(error) {
			log(error);
		}
		else {
			// parse json data and collect csv-friendly lines
			var data = JSON.parse(body);
			var lines = "";
			var date = new Date();
			var timeStamp = date.getTime();
			var timeString = date.toUTCString();
			var lineCount = 0;
			var lowestPriceCurrent = 99999;

			var allApartments = {};

			timeString = '"' + timeString + '"'; // encase in quotes
			for(var availableFloorPlanType of data.results.availableFloorPlanTypes) {
				for(var availableFloorPlan of availableFloorPlanType.availableFloorPlans) {
					for(var finishPackage of availableFloorPlan.finishPackages) {
						for(var apt of finishPackage.apartments) {
							var line = "";
							line += timeStamp.toString() + ",";
							line += timeString + ",";
							line += apt.apartmentCode + ",";
							line += apt.buildingNumber + ",";
							line += apt.apartmentNumber + ",";
							line += apt.pricing.amenitizedRent + ",";
							line += apt.pricing.effectiveRent + ",";
							line += "\n";

							lines += line;
							lineCount++;

							// filter for 1 bedroom only
							if(availableFloorPlanType.floorPlanTypeCode == "1BD")
							{
								// store apartment by unique id
								allApartments[apt.apartmentCode] = apt;
							}
							
							if(apt.pricing.effectiveRent < lowestPriceCurrent) {
								lowestPriceCurrent = apt.pricing.effectiveRent;
							}
						}							
					}
				}
			}

			//console.log(lines);
			//logger.log(lines);

			if(lines) {
				// append to file
				fs.appendFile("./avalon.csv", lines, function(error) {
					if(error) {
						log(error);
					}
					else {
						log("Logged " + lineCount + " lines on " + timeString);

						testNewLowestPrice(lowestPriceCurrent);
					}
				});
			}
			else {
				log("No lines to parse!");
			}

			// log apartment changes
			testApartmentChanges(allApartments);
		}
	});
}




var testNewLowestPrice = function(newPrice) {
	if(newPrice < lowestPriceEver) {
		var oldPrice = lowestPriceEver;
		lowestPriceEver = newPrice;

		log("New lowest price detected!");
		log("Old price: " + oldPrice);
		log("New price: " + newPrice);

		// save lowest price to file
		var fileWriteData = lowestPriceEver;
		fs.writeFile (lowestPriceFile, fileWriteData, function(err) {
	        if (err) {
	        	throw err;
	        }
	        //log('Saved new lowestPriceEver: ' + lowestPriceEver);
	    });

		// send me an email
		// setup e-mail data with unicode symbols
		log('Sending email alert...');

		var msg = "<b>Check it out!</b><br/><br/>";
		msg += "The last low price was: " + oldPrice + "<br/>";
		msg += "The new lowest price is: " + newPrice + "<br/>";

		// need to format nicely
		var fromEmail = transportConfig.senderEmail.replace('%40', '@'); 
		var toEmail = transportConfig.receiverEmail.replace('%40', '@'); 

		var mailOptions = {
		    from: '"Mailer" <' + fromEmail + '>', // sender address
		    to: toEmail, // list of receivers
		    subject: 'Apartment Hunt Price Alert', // Subject line
		    text: "", // plaintext body
		    html: msg // html body
		};


		// send mail with defined transport object
		transporter.sendMail(mailOptions, function(error, info){
		    if(error){
		        return console.log(error);
		    }
		    console.log('Message sent: ' + info.response);
		});
	}
	else
	{
		log("No price email alert needed");
	}

};

var testApartmentChanges = function(allApartments) {

	// load up the file
	// read lowest price
	fs.readFile(priceDataJSONFile, 'utf8', function (err, data) {
	    var oldAllApartments = {};
	    if (err) { 
	    	// file did not exist
	    	log("File " + priceDataJSONFile + " did not exist!");
	    } else {
			oldAllApartments = JSON.parse(data);
	    }

	    // overwrite latest apt data to file
	    var writeData = JSON.stringify(allApartments);
	    fs.truncate(priceDataJSONFile, 0, function() {
			fs.writeFile (priceDataJSONFile, writeData, function(err) {
		        if (err) {
		        	throw err;
		        }
		    });
		});


	    var soldApts = "";
	    var newApts = "";
	    var availableTimestamp;
	    var date;

	    // compare old file to new file
	    for(var key in oldAllApartments) {
	    	// are any old apartments removed (aka sold)?
	    	if(oldAllApartments.hasOwnProperty(key) && !(key in allApartments)) {
	    		var apt = oldAllApartments[key];
	    		availableTimestamp = apt.pricing.availableDate.replace(/^\D+|\D.*$/g, ""); // magic to extract number from string
	    		availableTimestamp = parseInt(availableTimestamp);
	    		date = new Date(availableTimestamp);
	    		soldApts += "" + apt.apartmentCode + " - $" + apt.pricing.effectiveRent + " - " + date.toUTCString() + "<br/>";
	    	}
	    }

	    for(var key in allApartments) {
	    	// are any new apartments added to the site?
	    	if(allApartments.hasOwnProperty(key) && !(key in oldAllApartments)) {
	    		var apt = allApartments[key];
	    		availableTimestamp = apt.pricing.availableDate.replace(/^\D+|\D.*$/g, ""); // magic to extract number from string
				availableTimestamp = parseInt(availableTimestamp);
	    		date = new Date(availableTimestamp);
	    		newApts += "" + apt.apartmentCode + " - $" + apt.pricing.effectiveRent + " - " + date.toUTCString() + "<br/>";
	    	}
	    }

	    if(soldApts.length > 0 || newApts.length > 0) {
	    	// send out an email!
			// setup e-mail data with unicode symbols
			log('Sending vacancy email alert...');

			var msg = "<b>Room availability has changed!</b><br/><br/>";
			msg += "New Apartments:<br/>";
			msg += newApts;
			msg += "<br/>";
			msg += "Sold Apartments:<br/>";
			msg += soldApts;

			// need to format nicely
			var fromEmail = transportConfig.senderEmail.replace('%40', '@'); 
			var toEmail = transportConfig.receiverEmail.replace('%40', '@'); 

			var mailOptions = {
			    from: '"Mailer" <' + fromEmail + '>', // sender address
			    to: toEmail, // list of receivers
			    subject: 'Apartment Hunt Vacancy Update', // Subject line
			    text: "", // plaintext body
			    html: msg // html body
			};

			// send mail with defined transport object
			transporter.sendMail(mailOptions, function(error, info){
			    if(error){
			        return console.log(error);
			    }
			    console.log('Message sent: ' + info.response);
			});

	    } else {
			log('No vacancy email alert needed');
	    }
	});
}



initTransporter();



