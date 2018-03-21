const Twilio 	= require('twilio')

const taskrouterHelper = require('./helpers/taskrouter-helper.js')
//const voice_settings = "{voice: 'woman',language: 'no'}";
//var voice_settings = JSON.parse({voice: 'woman',language: 'nb-NO'})

module.exports.welcome = function (req, res) {
	const twiml =  new Twilio.twiml.VoiceResponse()

	let keywords = []

	/* add the team names as hints to the automatic speech recognition  */
	for (let i = 0; i < req.configuration.ivr.options.length; i++) {
		keywords.push(req.configuration.ivr.options[i].friendlyName)
	}

	const gather = twiml.gather({
		input: 'dtmf speech',
		action: 'select-team',
		method: 'GET',
		numDigits: 1,
		timeout: 4,
		language: 'nb-NO',
		hints: keywords.join()
	}) //en-US

	gather.say(req.configuration.voice,req.configuration.ivr.text)

	twiml.say(req.configuration.voice,'Du sa ikke noe eller angir noen siffer.')
	twiml.pause({length: 2})
	twiml.redirect({method: 'GET'}, 'welcome')

	res.send(twiml.toString())
}

var analyzeKeypadInput = function (digits, options) {

	for (let i = 0; i < options.length; i++) {
		if (parseInt(digits) === options[i].digit) {
			return options[i]
		}
	}

	return null
}

var analyzeSpeechInput = function (text, options) {

	for (let i = 0; i < options.length; i++) {
		if (text.toLowerCase().includes(options[i].friendlyName.toLowerCase())) {
			return options[i]
		}
	}

	return null
}

module.exports.selectTeam = function (req, res) {
	let team = null

	/* check if we got a dtmf input or a speech-to-text */
	if (req.query.SpeechResult) {
		console.log('SpeechResult: ' + req.query.SpeechResult)
		team = analyzeSpeechInput(req.query.SpeechResult, req.configuration.ivr.options)
	}

	if (req.query.Digits) {
		team = analyzeKeypadInput(req.query.Digits, req.configuration.ivr.options)
	}

	const twiml =  new Twilio.twiml.VoiceResponse()

	/* the caller pressed a key that does not match any team */
	if (team === null) {
		// redirect the call to the previous twiml
		twiml.say({voice: 'alice',language: 'nb-NO'},'Ditt valg var ikke gyldig, prøv igjen.')
		twiml.pause({length: 2})
		twiml.redirect({ method: 'GET' }, 'welcome')
	} else {

		const gather = twiml.gather({
			action: 'create-task?teamId=' + team.id + '&teamFriendlyName=' + encodeURIComponent(team.friendlyName),
			method: 'GET',
			numDigits: 1,
			timeout: 5
		})

		gather.say({voice: 'alice',language: 'nb-NO'},'Trykk på en tast hvis du vil ha tilbakering fra ' + team.friendlyName + ', Eller bli på linjen.')

		/* create task attributes */
		const attributes = {
			text: 'Caller answered IVR with option "' + team.friendlyName + '"',
			channel: 'phone',
			phone: req.query.From,
			name: req.query.From,
			title: 'Inbound call',
			type: 'inbound_call',
			team: team.id
		}

		twiml.enqueue({
			workflowSid: req.configuration.twilio.workflowSid,
		}).task({priority: 1, timeout: 3600}, JSON.stringify(attributes));

	}

	res.send(twiml.toString())
}

module.exports.createTask = function (req, res) {
	/* create task attributes */
	const attributes = {
		text: 'Caller answered IVR with option "' + req.query.teamFriendlyName + '"',
		channel: 'phone',
		phone: req.query.From,
		name: req.query.From,
		title: 'Callback request',
		type: 'callback_request',
		team: req.query.teamId
	}

	const twiml =  new Twilio.twiml.VoiceResponse()

	taskrouterHelper.createTask(req.configuration.twilio.workflowSid, attributes)
		.then(task => {
			twiml.say({voice: 'alice',language: 'nb-NO'},'Takk for tilbakeringingsanmodningen din, En agent vil ringe deg tilbake snart.')
			twiml.hangup()
		}).catch(error => {
			twiml.say({voice: 'alice',language: 'nb-NO'},'beklager, farvel!') //sorry bye //'An application error occured, the demo ends now'
		}).then(() => {
			res.send(twiml.toString())
		})

}
