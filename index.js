require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
app.use(
	cors({
		origin: '*', //letting browser know any url can access this api
	})
);
const { google } = require('googleapis');
const oauth2Client = new google.auth.OAuth2(
	process.env.CLIENT_ID,
	process.env.CLIENT_SECRET,
	process.env.REDIRECT_URL
);
const scopes = ['https://www.googleapis.com/auth/youtube.readonly'];

app.get('/freeGames', (req, res) => {
	const rssUrl = 'https://steamcommunity.com/groups/freegamesfinders/rss/';

	getGames(rssUrl, req.query.lastGame).then((result) => {
		//calling the getgames function, the promise's value is then sent
		res.send({ games: result });
	});

	async function getGames(rssUrl, lastTitle) {
		try {
			return checkForNewGames(await parseXml(await getXml(rssUrl)), lastTitle); //calls all those functions
		} catch (err) {
			console.log(err);
		}
	}

	function getXml(rssUrl) {
		const request = require('request');
		return new Promise((resolve, reject) => {
			//creates a promise
			request(rssUrl, (err, res, body) => {
				if (err) {
					reject(err);
				}
				resolve(body); //value of promise, text xml
			});
		});
	}

	function parseXml(xmlString) {
		const xml2js = require('xml2js');
		return new Promise((resolve, reject) => {
			xml2js.parseString(xmlString, (err, res) => {
				if (err) {
					reject(err);
				}
				resolve(res.rss.channel[0].item); //value of promise, xml form of the xml
			});
		});
	}

	function checkForNewGames(data, lastTitle) {
		if (!lastTitle) return [[], data[0].title[0]]; //if lastTitle wasnt provided, happens when first installed
		let newGames = [];
		let i = 0;
		while (data[i].title[0] != lastTitle && i < 10) {
			//go through each game till you find last indexed one, hard limit of 10 in case something breaks
			newGames.push(...extractLink(data[i].description[0])); //if the game wasnt indexed before add it to the new games list
			i++;
		}
		if (i !== 0) lastTitle = data[0].title[0]; //update to newest title
		return [newGames, lastTitle];
	}

	function extractLink(description) {
		let gameLinks = [];
		description
			.match(
				/(a class="bb_link" href="http|a class="bb_link" href="https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])/gm
			)
			.forEach((gameUrl) => {
				//going thru all links in description
				gameUrl = gameUrl.substring(24, gameUrl.length);
				let censored = gameUrl.indexOf('linkfilter/?url='); //checking if steam filter is active
				if (censored != -1)
					gameUrl = gameUrl.substring(censored + 16, gameUrl.length); //if steam filter is active, remove it
				gameLinks.push(gameUrl);
			});
		return gameLinks;
	}
});

app.get('/oauth', (req, res) => {
	const authorizationUrl = oauth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: scopes,
		include_granted_scopes: true,
	});
	res.writeHead(301, { Location: authorizationUrl }).end();
});

app.get('/handleOauth', async function (req, res) {
	if (req.query.code) {
		let { tokens } = await oauth2Client.getToken(req.query.code);
		oauth2Client.setCredentials(tokens);
		res.redirect(
			process.env.REDIRECT_URL.startsWith('http://localhost:3000')
				? 'http://localhost:3000/getVideos'
				: 'https://pipapi.onrender.com/getVideos'
		);
	} else {
		res.send('uhh');
	}
});

app.get('/getVideos', (request, response) => {
	const youtube = google.youtube('v3');
	let videos = [];
	fetchVideos();
	function fetchVideos(pageToken) {
		youtube.playlistItems.list(
			{
				auth: oauth2Client,
				part: 'contentDetails, snippet',
				maxResults: 50,
				playlistId: 'PL278kIbxfIKfRyGZjwEx8rJfsICfbrNZi',
				pageToken: pageToken,
			},
			(err, res) => {
				if (err) {
					console.log('The API returned an error: ' + err);
					response.send('error please validate at url');
					return;
				}
				res.data.items.forEach((video) =>
					videos.push({
						title: video.snippet.title,
						id: video.contentDetails.videoId,
					})
				);
				if (res.data.nextPageToken) fetchVideos(res.data.nextPageToken);
				else {
					response.send(videos);
				}
			}
		);
	}
});

app.listen(process.env.PORT || 3000, () => console.log('BANZAI'));
