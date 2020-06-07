
//getting the express module
var express = require('express');
var app = express();
//getting the server ready
var serv = require('http').Server(app);

//calling the html file (what the user sees) when they load the page
app.get('/', function(req, res) {
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

//starting the server on port 2000
var port = process.env.PORT || 2000;
serv.listen(port);
console.log("Server started")


var SOCKET_LIST= {};
var PLAYER_LIST= {};

//list of all sockets and players
var server = {
	main: {
		playingGamesBools: {
			playinghangman: false
		},
		num_players: 0
	}
};

var Hangman = function(){
	var self = {
		currentword: "",
		guessedLetters: [],
		errors: 0,
		wordstate: [],
		guessed: false,
		wrongletters: [],
		win: false,
		lose: false
	}
	self.generateWord = function(){
		words = ["alligator", "coat", "square", "human", "distance"];
		self.currentword = words[Math.floor(5*Math.random())];
		for(let letter in self.currentword){
			self.wordstate.push("");
		}
	}
	self.updateWordGuess = function(){
		//calculate current wordstate
		for(let i = 0; i < self.currentword.length; i++){
			if(self.guessedLetters.includes(self.currentword[i])){
				self.wordstate[i] = self.currentword[i];
			}
		}
		//calculate errors
		var lettersmissed = 0;
		for(let i = 0; i < self.guessedLetters.length; i++){
			if(!self.currentword.includes(self.guessedLetters[i])){
				if(!self.wrongletters.includes(self.guessedLetters[i])){
					self.wrongletters.push(self.guessedLetters[i]);
				}
				lettersmissed++;
			}
		}
		self.errors = lettersmissed;

		self.guessed = true;
		for(let b = 0; b < self.currentword.length; b++){
			if(self.wordstate[b] != self.currentword[b]){
				self.guessed = false;
			}
		}
	}
	return self;
}

var Player = function(id){
	var self = {
		id: id,
		name: "anonymous",
		cserver: "main",
		number: 0
	}
	self.getNumber = () => {
		self.number = server[self.cserver].num_players;
		return self.number;
	}
	return self;
}

//socket.io connection from client
var io = require('socket.io')(serv, {});
//on user connection
io.sockets.on('connection', function(socket){

	//unique id 
	socket.id = Math.random();

	//add to the socket list
	SOCKET_LIST[socket.id] = socket;
	socket.currentserver = "main";
	//generate a player object
	server[socket.currentserver].num_players++;
	console.log(server[socket.currentserver].num_players + ' players in '+ socket.currentserver);
	sendSocketData();
	

	var player = Player(socket.id);
	player.getNumber();
	

	//add to the player list
	PLAYER_LIST[socket.id] = player;
	console.log('socket connection');

	function sendSocketData(){
		socket.emit('sendSocketData', socket.currentserver);
	}

	//update username of player
	socket.on('usernameUpdate', function(username){
		player.name = username;
	});

	//hangman start
	socket.on('hangmanStart', (lobby) => {
		console.log('playing hangman');
		server[lobby].playingGamesBools.playinghangman = true;
		server[lobby].game = Hangman();
		server[lobby].game.generateWord();
		console.log(server[lobby].game.currentword);
		console.log(server[lobby].game.wordstate);
	})

	//user guesses in hangman
	socket.on('guess', function(contents){
		var guess = contents[0];
		var lobby = contents[1];
		guess = guess.toLowerCase()
		if(server[lobby].playingGamesBools.playinghangman){
			if(!server[lobby].game.guessedLetters.includes(guess)){
				server[lobby].game.guessedLetters.push(guess);
				console.log('guessed: ' + guess);
			}
			console.log("current word state: " + server[lobby].game.wordstate);
			console.log("guessed letters: " + server[lobby].game.guessedLetters);
			console.log("wrong letters: " + server[lobby].game.wrongletters);
		}
	});

	socket.on('disconnect', function(){
		delete SOCKET_LIST[socket.id];
		delete PLAYER_LIST[socket.id];

		server[socket.currentserver].num_players--;
		console.log(server[socket.currentserver].num_players + " players left in " + socket.currentserver);
		//console.log('player disconnect. ' + players + ' players left.')
	});

});

var counter = 0;
//loop to update positions of players,  sends data to clientside of what to draw
setInterval(function(){

	//update data of all lobbies
	for(let i = 0; i < Object.keys(server).length; i++){
		var lobby = server[Object.keys(server)[i]];
		lobby.playerdata = [];
		//logic to run while playing hangman
		if(lobby.playingGamesBools.playinghangman){
			lobby.game.updateWordGuess();
			if(lobby.game.guessed){
				//game is won
				console.log('win');

				//delay to updating gamestate
				if(counter > 30){
					lobby.game.win = true;
				}

				//delay to display winscreen
				if(counter > 120){
					lobby.playingGamesBools.playinghangman = false;
					counter = 0;
				}
				else{
					counter++;
				}
			}
			//game is lost
			else if(lobby.game.errors >= 6){
				console.log('loss');

				//delay to updating gamestate
				if(counter > 30){
					lobby.game.lose = true;
				}
				//delay to display lossscreen
				if(counter > 120){
					lobby.playingGamesBools.playinghangman = false;
					counter = 0;
				}
				else{
					counter++;
				}
			}
		}
	}
	

	//update players
	for(let i = 0; i < Object.keys(PLAYER_LIST).length; i++){
		var p = PLAYER_LIST[Object.keys(PLAYER_LIST)[i]];
		server[p.cserver].playerdata.push({
			name: p.name,
			number: i + 1
		});
	}

	//send the data of all players to every connection
	for(let i in SOCKET_LIST){
		let socket = SOCKET_LIST[i];
		socket.emit('gameUpdate', server);
	}
}, 1000/25);