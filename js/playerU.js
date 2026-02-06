		
			var music = document.getElementById('music'); // id for audio element
			var duration; // Duration of audio clip
			var pButton = document.getElementById('pButton'); // play button

			var playhead = document.getElementById('playhead'); // playhead

			var timeline = document.getElementById('timeline'); // timeline
			var icons = document.getElementById('icons'); // timeline

			var volume = document.getElementById('volume'); // timeline
			var muteIcon = document.getElementById('mute'); // timeline
			var halfIcon = document.getElementById('half'); // timeline

			var volumeBar = document.getElementById('volumeBar'); // timeline
			var innerVolume = document.getElementById('innerVolume'); // timeline
			var timelineWidth = window.innerWidth/* - playhead.offsetWidth;*/;
			var timelineHeight = 60/* - playhead.offsetWidth;*/;
			var volumeBarHeight = 120;
			var volumeAmt = 1.0;
			var volMult = 1.0;
			var muted = false;
		function initPlayer(data){


			if(data.showPlayPause == false){
				pButton.style.display = "none"
			} 
		
		}
		var counter = 0;
		
		icons.addEventListener("click", function(event){
			if(counter%3 == 0){
				halfIcon.style.display = "block";	
				volume.style.display = "none";	
				muteIcon.style.display = "none";	
				volMult = 0.5;
			} else if (counter%3==1){
				halfIcon.style.display = "none";	
				volume.style.display = "none";	
				muteIcon.style.display = "block";	
				volMult = 0.0;
			} else if (counter%3 == 2){
				halfIcon.style.display = "none";	
				volume.style.display = "block";	
				muteIcon.style.display = "none";	
				volMult = 1.0;
			}
			counter++;
		})
		

