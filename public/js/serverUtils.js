var Utils = {};

//Réactions au événemments

Utils.onLogin = function(data, socket){
	var pseudoPris = false;
	if(data.length == 0){
		return;
	}
	var pseudo = data.slice(0, 15);
	for(var i in game.players){
		if(game.players[i].pseudo == pseudo){
			pseudoPris = true;
			socket.emit("login", false);
		}
	}
	if(!pseudoPris){
		var p = new Player({id:nbClients,socket:socket.id,pseudo:pseudo});
		nbClients++;
		socket.emit("playerID", p.id);
		game.addPlayer(p);
		socket.emit("refreshRooms", game.getRefreshRooms());
		io.emit("nbPlayers", game.getNbPlayers());
	}
}

Utils.onTchat = function(data, socket){
	var p = game.getPlayerBySocket(socket.id);
	if(!p){return;}
	var players = [];
	if(p.room != null){
		players = p.room.getPlayers();
	}else{
		players = game.getNoneRoomPlayers();
	}
	if(data[0] == "/"){
		var split = data.split(" ");
		switch (split[0]) {
			case "/w":
			if(split.length >= 3){
				for(var i in game.players){
					if(game.players[i].pseudo == split[1]){
						var msg = data.substr(3 + split[1].length);
						this.messageTo(socket.id, "tchat", "A "+split[1]+" : "+msg);
						this.messageTo(game.players[i].socket, "tchat", "De "+p.pseudo+" : "+msg);
						break;
					}
				}
			}
			break;
			case "/name":
			var itsOk = true;
			if(split.length >= 2 && split[1] != ""){
				for(var i in game.players){
					if(game.players[i].pseudo == split[1]){
						itsOk = false;
						break;
					}
				}
				if(itsOk){
					p.pseudo = split[1];
					this.messageTo(p.socket, "information", "Vous appelez maintenant "+p.pseudo+" !");
				}
			}
			break;
		}
	}else{
		for(var i in players){
			this.messageTo(players[i].socket, "tchat", p.pseudo+" : "+data);
		}
	}
	
}

Utils.onMove = function(data, socket){
	var p = game.getPlayerBySocket(socket.id);
	if(!p){return;}
	p.setDirection(data.x, data.y);
}

Utils.onSpell = function(data, socket){
	var p = game.getPlayerBySocket(socket.id);
	if(!p){return;}
	if(p.room == null){return;}
	var spell = p.getSpell(data.spell);
	var isOk = false;
	if(spell != null){
		if(data.x && data.y){
			isOk = spell.use(p, data.x, data.y);	
		}else{
			isOk = spell.use(p);
		}
	}
	if(isOk){
		for(var i in p.room.players){
			this.messageTo(p.room.players[i].socket, "spell", {pID:p.id, spellId:spell.id});
		}
	}
}

Utils.onJoinRoom = function(data, socket){
	var p = game.getPlayerBySocket(socket.id); 
	if(!p){return;}
	var room = game.getRoom(data);
	if(p.room == null && room && room.getPlayers().length < room.nbPlayer){
		p.room = room;
		var nbPlayerTeam1 = room.getPlayersTeam(1).length;
		(nbPlayerTeam1 >= room.nbPlayer/2) ? p.team = 2 : p.team = 1;
		room.addPlayer(p);
		Utils.sendInit(p, p.room, socket);
		//On prévient tous les joueurs de la game du nouveau joueur
		for(var i in room.players){
			if(room.players[i].id != p.id){
				this.messageTo(room.players[i].socket, "addPlayer", p.getInitPlayer());
			}
			//Message informatif
			this.messageTo(room.players[i].socket, "information", p.pseudo+" rejoint la partie ("+Object.keys(room.players).length+"/"+room.nbPlayer+").");
		}
	}
	io.emit("refreshRooms", game.getRefreshRooms());
}

Utils.onLeaveRoom = function(data, socket){
	var p = game.getPlayerBySocket(socket.id);
	if(!p){return;}
	if(p.room != null){
		var room = p.room;
		if(p.hasBall()){
			room.ball.player = null; 
		}
		p.room.removePlayer(p.id);
		p.room = null;
		p.team = 0;
		if(room.players.length == 0){
			//Si plus de joueur on supprime la room
			game.deleteRoom(room.id);
		}else{
			for(var i in room.players){
				this.messageTo(room.players[i].socket, "removePlayer", p.id);
				this.messageTo(room.players[i].socket, "information", p.pseudo+" quitte la partie ("+Object.keys(room.players).length+"/"+room.nbPlayer+").");
			}
		}
	}
	io.emit("refreshRooms", game.getRefreshRooms());
}

Utils.onCreateRoom = function(data, socket){
	var p = game.getPlayerBySocket(socket.id);
	if(!p){return;}
	if(p.room != null){
		this.onLeaveRoom({}, socket);
	}
	if(!(data.name.length > 0 && parseInt(data.nb) > 0 && data.nb%2 == 0 && parseInt(data.time) > 0)){
		//on test les trucs
		return;
	}
	var room = game.addRoom(nbRooms, data.name, parseInt(data.nb), parseInt(data.time) * 60 * 1000, p);
	nbRooms++;
	p.room = room;
	p.team = 1;
	p.room.addPlayer(p);
	Utils.sendInit(p, p.room, socket);
	io.emit("refreshRooms", game.getRefreshRooms());
}

Utils.onChangeTeam = function(data, socket){
	var p = game.getPlayerBySocket(socket.id);
	if(!p){return;}
	if(p.room && !p.room.started){
		var otherTeam;
		(p.team == 1) ? otherTeam = 2 : otherTeam = 1;
		var nbPlayerOther = p.room.getPlayersTeam(otherTeam).length;
		if(nbPlayerOther < p.room.nbPlayer){
			p.team = otherTeam;
		}
		for(var i in p.room.players){
			this.messageTo(p.room.players[i].socket, "switchTeam", {id:p.id, team:p.team});
			this.messageTo(p.room.players[i].socket, "information", p.pseudo+" rejoint l'équipe "+p.team+".");
		}
	}
}

Utils.onDisconnect = function(socket){
	var p = game.getPlayerBySocket(socket.id);
	if(!p){return;}
	if(p.room != null){
		Utils.onLeaveRoom({}, socket);
	}
	game.deletePlayer(socket.id);
	io.emit("nbPlayers", game.getNbPlayers());
}

//Fonction d'aide

Utils.sendInit = function(player, room, socket){
	socket.emit("initRoom", room.getInitInfo());
}

Utils.messageTo = function(socket, type, message){
	io.sockets.connected[socket].emit(type, message);
}