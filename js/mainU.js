var isMobile = false;
(function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4)))isMobile = true})(navigator.userAgent||navigator.vendor||window.opera);

// if ( ! Detector.webgl || isMobile ) Detector.addGetWebGLMessage();

var scene, camera, renderer, controls;
var container;
var loader;
var w = window.innerWidth;
var h = window.innerHeight;
var globalUniforms;
var time = 0;
var video, videoLoaded = false, camTex;
var scene1, scene2;
var rt1, rt2;
var material1, material2;
var planeGeometry;
var mesh1, mesh2;
var mouseX = 0.0, mouseY =1.0;
var time = 0.0;
var redx = 200;
var greenx = 0.0;
var bluex = 255;
var redy = 0.0;
var greeny = 0.0;
var bluey = 0.0;

var goo = 90;
var blurWidth = 1.0;
var lightWidth = 9;
var lightBrightness = 0.0;

var topLeft = document.getElementById("topLeft");
var topRight = document.getElementById("topRight");
var bottomLeft = document.getElementById("bottomLeft");
var bottomRight = document.getElementById("bottomRight");
var middle = document.getElementById("middle");
var lenght, squareCoords;
var halfWidth, halfHeight;
calculateSquare();
	var data = {
					"id": 2,
					"category": 1,
					"name": "UNCTION",
					"link": "/darqness.html",
					"showPlayPause": "false",
					"scrubbable": "false",
					"artist": "EZRA MILLER",
					"linkToArtist": "http://ezramiller.biz/"

				};
initPlayer(data);
// if ( ! Detector.webgl || isMobile ){
// 	Detector.addGetWebGLMessage();
// } else {
	

// }

initScene();
function calculateSquare(){
	if(window.innerWidth>=window.innerHeight){
		length = window.innerHeight;
	} else {
		length = window.innerWidth;
	}
	var div = document.getElementById("squareDiv");
	div.style.width = length;
	div.style.height = length;

	squareCoords = {
		topLeft: new THREE.Vector2(window.innerWidth/2 - length/2, window.innerHeight/2 - length/2),
		topRight: new THREE.Vector2(window.innerWidth/2 + length/2, window.innerHeight/2 - length/2),
		bottomLeft: new THREE.Vector2(window.innerWidth/2 - length/2, window.innerHeight/2 + length/2),
		bottomRight: new THREE.Vector2(window.innerWidth/2 + length/2, window.innerHeight/2 + length/2)
	}
	halfWidth = window.innerWidth/2;
	halfHeight = window.innerHeight/2;
}


function initScene(){
	container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(50, w / h, 1, 100000);
    camera.position.set(0,0, 750);//test
    cameraRTT = new THREE.OrthographicCamera( w / - 2, w / 2, h / 2, h / - 2, -10000, 10000 );
	cameraRTT.position.z = 100;

	// controls = new THREE.OrbitControls(camera);


    renderer = new THREE.WebGLRenderer({preserveDrawingBuffer:true});
    renderer.setSize(w, h);
    renderer.setClearColor(0xffffff, 1);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    initGlobalUniforms();
    initCanvasTex();
	document.addEventListener( 'keydown', onKeyDown, false );
	window.addEventListener( 'resize', onWindowResize, false );

    document.addEventListener('mousemove', onDocumentMouseMove, false);
    // document.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener( 'touchstart', onDocumentTouchStart, false );
    document.addEventListener( 'touchmove', onDocumentTouchMove, false );
    document.addEventListener( 'touchend', onDocumentTouchEnd, false );
    document.addEventListener( 'touchcancel', onDocumentTouchEnd, false );
    document.addEventListener( 'touchleave', onDocumentTouchEnd, false );

    animate();
}
function initGlobalUniforms(){
	globalUniforms = {
		time: {type: 'f', value: time},
		resolution: {type: 'v2', value: new THREE.Vector2(w,h)},
		mouseX: {type: 'f', value: 0.0},
		mouseY: {type: 'f', value: 0.0}
	}
}
function initCanvasTex(){
	canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	ctx = canvas.getContext("2d");

    tex = new THREE.Texture(canvas);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    camTex = tex;
    initFrameDifferencing();

	many();

}
function initCameraTex(){
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.oGetUserMedia;
    if (navigator.getUserMedia) {       
        navigator.getUserMedia({video: true, audio: false}, function(stream){
        	var url = window.URL || window.webkitURL;
			video = document.createElement("video");
	        video.src = url ? url.createObjectURL(stream) : stream;
	        // video.src = "satin.mp4";
	        // video.loop = true;
	        // video.playbackRate = 0.25;
	        video.play();
	        videoLoaded = true;
	        tex = new THREE.Texture(video);
	        tex.needsUpdate = true;
	        camTex = tex;
	        initFrameDifferencing();
        }, function(error){
		   console.log("Failed to get a stream due to", error);
	    });
	}
}

function initFrameDifferencing(){
	planeGeometry = new THREE.PlaneGeometry(w,h);

	scene1 = new THREE.Scene();
	rt1 = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
	material1 = new THREE.ShaderMaterial({
		uniforms: {
			time: { type: 'f' , value: time},
			resolution: {type: 'v2', value: new THREE.Vector2(w,h)},
			texture: {type: 't', value: camTex},
			mouseX: {type: 'f', value: mouseX},
			mouseY: {type: 'f', value: mouseY},
			goo: {type: 'f', value: goo}

		},
		vertexShader: document.getElementById("vs").textContent,
		fragmentShader: document.getElementById("fbFs").textContent
	});
	mesh1 = new THREE.Mesh(planeGeometry, material1);
	mesh1.position.set(0, 0, 0);
	scene1.add(mesh1);

	scene2 = new THREE.Scene();
	rt2 = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
	material2 = new THREE.ShaderMaterial({
		uniforms: {
			time: { type: 'f' , value: time},
			resolution: {type: 'v2', value: new THREE.Vector2(w,h)},
			texture: {type: 't', value: rt1},
			texture2: {type: 't', value: camTex},
			mouseX: {type: 'f', value: mouseX},
			mouseY: {type: 'f', value: mouseY},
			blurWidth: {type: 'f', value: blurWidth}
		},
		vertexShader: document.getElementById("vs").textContent,
		fragmentShader: document.getElementById("blurFrag").textContent
	});
	mesh2 = new THREE.Mesh(planeGeometry, material2);
	mesh2.position.set(0, 0, 0);
	scene2.add(mesh2);

	sceneDiff = new THREE.Scene();
	rtDiff = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
	materialDiff = new THREE.ShaderMaterial({
		uniforms: {
			time: { type: 'f' , value: time},
			resolution: {type: 'v2', value: new THREE.Vector2(w,h)},
			texture: {type: 't', value: rt1},
			texture2: {type: 't', value: rt2},
			texture3: {type: 't', value: camTex} 
		},
		vertexShader: document.getElementById("vs").textContent,
		fragmentShader: document.getElementById("diffFs").textContent
	});
	meshDiff = new THREE.Mesh(planeGeometry, materialDiff);
	sceneDiff.add(meshDiff);

	sceneFB = new THREE.Scene();
	rtFB = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
	materialFB = new THREE.ShaderMaterial({
		uniforms: {
			time: { type: 'f' , value: time},
			resolution: {type: 'v2', value: new THREE.Vector2(w,h)},
			texture: {type: 't', value: rtDiff},
			mouseX: {type: 'f', value: mouseX},
			mouseY: {type: 'f', value: mouseY}
		},
		vertexShader: document.getElementById("vs").textContent,
		fragmentShader: document.getElementById("fs").textContent
	});
	meshFB = new THREE.Mesh(planeGeometry, materialFB);
	sceneFB.add(meshFB);

	sceneFB2 = new THREE.Scene();
	rtFB2 = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
	materialFB2 = new THREE.ShaderMaterial({
		uniforms: {
			time: { type: 'f' , value: time},
			resolution: {type: 'v2', value: new THREE.Vector2(w,h)},
			texture: {type: 't', value: rtFB},
			mouseX: {type: 'f', value: mouseX},
			mouseY: {type: 'f', value: mouseY}
		},
		vertexShader: document.getElementById("vs").textContent,
		fragmentShader: document.getElementById("fs").textContent
	});
	meshFB2 = new THREE.Mesh(planeGeometry, materialFB2);
	sceneFB2.add(meshFB2);

	sceneBump = new THREE.Scene();
	rtBump = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBFormat });
	materialBump = new THREE.ShaderMaterial({
		uniforms: {
			time: { type: 'f' , value: time},
			resolution: {type: 'v2', value: new THREE.Vector2(w,h)},
			texture: {type: 't', value: rtFB2},
			mouseX: {type: 'f', value: mouseX},
			mouseY: {type: 'f', value: mouseY},
			lightWidth: {type: 'f', value: mouseY},
			lightBrightness: {type: 'f', value: mouseY}
		},
		vertexShader: document.getElementById("vs").textContent,
		fragmentShader: document.getElementById("bumpFs").textContent
	});
	meshBump = new THREE.Mesh(planeGeometry, materialBump);
	sceneBump.add(meshBump);


	material = new THREE.MeshBasicMaterial({map: rtBump});
	mesh = new THREE.Mesh(planeGeometry, material);
	scene.add(mesh);
	mesh.position.z = -100;
}
function animate(){
	window.requestAnimationFrame(animate);
	draw();
}
function bezierX(x1, y1, x2, y2, hue){

    ctx.beginPath();

   // ctx.moveTo(x1+(0.5+ 0.5*Math.sin(time)*canvas.width), y1);
    //ctx.lineTo(x2+(0.5+ 0.5*Math.sin(time)*canvas.width), y2);
    ctx.moveTo(x1+Math.cos(time/5)*canvas.width, y1);
    ctx.lineTo(x2-Math.sin(time/5)*canvas.width, y2);

    ctx.lineWidth = lineWidth;
    
    // line color
    ctx.strokeStyle = hue;
    ctx.stroke();   
}
function bezierY(x1, y1, x2, y2, hue){
    ctx.beginPath();

    ctx.moveTo(x1, y1-Math.cos(time/4)*canvas.height);
    ctx.lineTo(x2, y2+Math.sin(time/4)*canvas.height);

    ctx.lineWidth = lineWidth;
    
    // line color
    ctx.strokeStyle = hue;
    ctx.stroke();  
}
var time = 2.0;
function many(){
    time+=0.01;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var wy = canvas.width;
    var hy = 50;
    var wx = 50;
    var hx = canvas.height;
    var amp = 75;
    var distX = 1;
    var distY = 2;
    var alpha = 1.0;
    lineWidth = 0.25;



   for(var j = -canvas.height; j < canvas.height*2; j+=distY){
	redy = Math.floor(map(0.5+0.5*Math.cos(time*4/3), 1, 0, 255));
	greeny = Math.floor(map(j, h, 0, 255));
	bluey = Math.floor(map(0.5+0.5*Math.sin(time/2), 1, 0, 255));
    	var color = "rgba("+redy+","+greeny+", "+bluey+", "+alpha+")";
        bezierY(0,j, canvas.width, j, "#000000" /*hslaColor(j/5, 100, 50, alpha)*/);  
    }
    for(var i = -canvas.width; i < canvas.width*2; i+=distX){
	// redx = Math.floor(map(0.5+0.5*Math.cos(time), 1, 125, 200));
	// greenx = 200;
	// bluex = 255;
    	var color = "rgba("+redx+","+greenx+", "+bluex+", "+alpha+")";
        bezierX(i, 0, i, canvas.height, color /*hslaColor(i/5, 100, 50, alpha)*/);  

    }
    //ctx.rotate(Math.PI/1000);


}

function hslaColor(h,s,l,a)
  {
    return 'hsla(' + h + ',' + s + '%,' + l + '%,' + a + ')';
  }

function onMouseDown(){

}
// many();
function draw(){
	time+=0.001;
    camTex.needsUpdate = true;

    // expand(1.01);
    // materialDiff.uniforms.texture.value = rtFB;
    material1.uniforms.texture.value = rtDiff;
    material1.uniforms.goo.value = goo;
    material2.uniforms.blurWidth.value = blurWidth;
	materialBump.uniforms.lightWidth.value = lightWidth;
	materialBump.uniforms.lightBrightness.value = lightBrightness;

    // material2.uniforms.texture.value = rtFB;

	renderer.render(scene2, cameraRTT, rt2, true);

	renderer.render(sceneDiff, cameraRTT, rtDiff, true);

	renderer.render(sceneFB, cameraRTT, rtFB, true);
	renderer.render(sceneFB2, cameraRTT, rtFB2, true);
	renderer.render(sceneBump, cameraRTT, rtBump, true);

	renderer.render(scene, cameraRTT);

    renderer.render(scene1, cameraRTT, rt1, true);


    var a = rtFB;
    rtFB = rt1;
    rt1 = a;

}

function expand(expand){
		meshDiff.scale.set(expand,expand,expand);
}
function map(value,max,minrange,maxrange) {
    return ((max-value)/(max))*(maxrange-minrange)+minrange;
}
function onWindowResize( event ) {
    calculateSquare();
    renderer.setSize( window.innerWidth, window.innerHeight );
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();

}
function onDocumentMouseMove(event){
	unMappedMouseX = (event.clientX );
    unMappedMouseY = (event.clientY );
    mouseX = map(unMappedMouseX, window.innerWidth, -2.5,2.5);
    // mouseY = map(unMappedMouseY, window.innerHeight, 0.9,1.1);
    mouseY = map(unMappedMouseY, window.innerHeight, -1.5,1.5);

    materialFB2.uniforms.mouseX.value = mouseX;
    material1.uniforms.mouseX.value = mouseX;
    materialBump.uniforms.mouseX.value = unMappedMouseX;
    materialFB2.uniforms.mouseY.value = mouseY;
    material1.uniforms.mouseY.value = mouseY;
    materialBump.uniforms.mouseY.value = unMappedMouseY;
/*    var d2A = {  //distance to audio
    	topLeft: new THREE.Vector2(0 - unMappedMouseX, 0 - unMappedMouseY),
    	topRight: new THREE.Vector2(window.innerWidth - unMappedMouseX, 0 - unMappedMouseY),
    	bottomLeft: new THREE.Vector2(0 - unMappedMouseX, window.innerHeight - unMappedMouseY),
    	bottomRight: new THREE.Vector2(window.innerWidth - unMappedMouseX, window.innerHeight - unMappedMouseY),
    }*/
    var d2A = {  //distance to audio
    	topLeft: new THREE.Vector2(squareCoords.topLeft.x - unMappedMouseX, squareCoords.topLeft.y - unMappedMouseY),
    	topRight: new THREE.Vector2(squareCoords.topRight.x - unMappedMouseX, squareCoords.topRight.y - unMappedMouseY),
    	bottomLeft: new THREE.Vector2(squareCoords.bottomLeft.x - unMappedMouseX, squareCoords.bottomLeft.y - unMappedMouseY),
    	bottomRight: new THREE.Vector2(squareCoords.bottomRight.x - unMappedMouseX, squareCoords.bottomRight.y - unMappedMouseY),
    	middle: new THREE.Vector2(halfWidth - unMappedMouseX, halfHeight - unMappedMouseY),
    }    
    distObj = { //object to hold distances
    	topLeft: Math.sqrt((d2A["topLeft"].x*d2A["topLeft"].x) + (d2A["topLeft"].y*d2A["topLeft"].y)),
    	topRight: Math.sqrt((d2A["topRight"].x*d2A["topRight"].x) + (d2A["topRight"].y*d2A["topRight"].y)),
    	bottomLeft: Math.sqrt((d2A["bottomLeft"].x*d2A["bottomLeft"].x) + (d2A["bottomLeft"].y*d2A["bottomLeft"].y)),
    	bottomRight: Math.sqrt((d2A["bottomRight"].x*d2A["bottomRight"].x) + (d2A["bottomRight"].y*d2A["bottomRight"].y)),
    	middle: Math.sqrt((d2A["middle"].x*d2A["middle"].x) + (d2A["middle"].y*d2A["middle"].y))
	}
	// console.log(distObj);
	handleAudio(distObj);

}

function onDocumentTouchStart( event ) {
    if ( event.touches.length === 1 ) {
        event.preventDefault();
    	unMappedMouseTouchX = (event.touches[ 0 ].pageX );
	    unMappedMouseTouchY = (event.touches[ 0 ].pageY );
	    mouseX = map(unMappedMouseTouchX, window.innerWidth, -2.5,2.5);
	    mouseY = map(unMappedMouseTouchY, window.innerHeight, 0.5,1.5);

        materialFB2.uniforms.mouseX.value = mouseX;
	    material1.uniforms.mouseX.value = mouseX;
	    materialBump.uniforms.mouseX.value = unMappedMouseTouchX;
	    materialFB2.uniforms.mouseY.value = mouseY;
	    material1.uniforms.mouseY.value = mouseY;
	    materialBump.uniforms.mouseY.value = unMappedMouseTouchY;
        var d2A = {  //distance to audio
	    	topLeft: new THREE.Vector2(squareCoords.topLeft.x - unMappedMouseTouchX, squareCoords.topLeft.y - unMappedMouseTouchY),
	    	topRight: new THREE.Vector2(squareCoords.topRight.x - unMappedMouseTouchX, squareCoords.topRight.y - unMappedMouseTouchY),
	    	bottomLeft: new THREE.Vector2(squareCoords.bottomLeft.x - unMappedMouseTouchX, squareCoords.bottomLeft.y - unMappedMouseTouchY),
	    	bottomRight: new THREE.Vector2(squareCoords.bottomRight.x - unMappedMouseTouchX, squareCoords.bottomRight.y - unMappedMouseTouchY),
	    	middle: new THREE.Vector2(halfWidth - unMappedMouseTouchX, halfHeight - unMappedMouseTouchY),
	    }    
	    distObj = { //object to hold distances
	    	topLeft: Math.sqrt((d2A["topLeft"].x*d2A["topLeft"].x) + (d2A["topLeft"].y*d2A["topLeft"].y)),
	    	topRight: Math.sqrt((d2A["topRight"].x*d2A["topRight"].x) + (d2A["topRight"].y*d2A["topRight"].y)),
	    	bottomLeft: Math.sqrt((d2A["bottomLeft"].x*d2A["bottomLeft"].x) + (d2A["bottomLeft"].y*d2A["bottomLeft"].y)),
	    	bottomRight: Math.sqrt((d2A["bottomRight"].x*d2A["bottomRight"].x) + (d2A["bottomRight"].y*d2A["bottomRight"].y)),
	    	middle: Math.sqrt((d2A["middle"].x*d2A["middle"].x) + (d2A["middle"].y*d2A["middle"].y))
		}
		// console.log(distObj);
		handleAudio(distObj);
	}

}

function onDocumentTouchMove( event ) {
    if ( event.touches.length === 1 ) {
        event.preventDefault();
        
    	unMappedMouseTouchX = (event.touches[ 0 ].pageX );
	    unMappedMouseTouchY = (event.touches[ 0 ].pageY );
	    mouseX = map(unMappedMouseTouchX, window.innerWidth, -2.5,2.5);
	    mouseY = map(unMappedMouseTouchY, window.innerHeight, -1.0,1.5);

        materialFB2.uniforms.mouseX.value = mouseX;
	    material1.uniforms.mouseX.value = mouseX;
	    materialBump.uniforms.mouseX.value = unMappedMouseTouchX;
	    materialFB2.uniforms.mouseY.value = mouseY;
	    material1.uniforms.mouseY.value = mouseY;
	    materialBump.uniforms.mouseY.value = unMappedMouseTouchY;

        var d2A = {  //distance to audio
	    	topLeft: new THREE.Vector2(squareCoords.topLeft.x - unMappedMouseTouchX, squareCoords.topLeft.y - unMappedMouseTouchY),
	    	topRight: new THREE.Vector2(squareCoords.topRight.x - unMappedMouseTouchX, squareCoords.topRight.y - unMappedMouseTouchY),
	    	bottomLeft: new THREE.Vector2(squareCoords.bottomLeft.x - unMappedMouseTouchX, squareCoords.bottomLeft.y - unMappedMouseTouchY),
	    	bottomRight: new THREE.Vector2(squareCoords.bottomRight.x - unMappedMouseTouchX, squareCoords.bottomRight.y - unMappedMouseTouchY),
	    	middle: new THREE.Vector2(halfWidth - unMappedMouseTouchX, halfHeight - unMappedMouseTouchY),
	    }    
	    distObj = { //object to hold distances
	    	topLeft: Math.sqrt((d2A["topLeft"].x*d2A["topLeft"].x) + (d2A["topLeft"].y*d2A["topLeft"].y)),
	    	topRight: Math.sqrt((d2A["topRight"].x*d2A["topRight"].x) + (d2A["topRight"].y*d2A["topRight"].y)),
	    	bottomLeft: Math.sqrt((d2A["bottomLeft"].x*d2A["bottomLeft"].x) + (d2A["bottomLeft"].y*d2A["bottomLeft"].y)),
	    	bottomRight: Math.sqrt((d2A["bottomRight"].x*d2A["bottomRight"].x) + (d2A["bottomRight"].y*d2A["bottomRight"].y)),
	    	middle: Math.sqrt((d2A["middle"].x*d2A["middle"].x) + (d2A["middle"].y*d2A["middle"].y))
		}
		// console.log(distObj);
		handleAudio(distObj);
    }
}
    
function onDocumentTouchEnd( event ) {
    mouseX = 0; 
    mouseY = 0;
}
function handleAudio(distance){
	// var max = Math.sqrt((window.innerWidth*window.innerWidth) + (window.innerHeight*window.innerHeight));
	// var max = Math.sqrt((length/2*length/2) + (length/2*length/2));
	// if(unMappedMouseX < window.innerWidth/2 &&  unMappedMouseY < window.innerHeight/2){
		
		max = length*Math.sqrt(2)/2;

	if(distance.topLeft>=max)distance.topLeft = max;
	if(distance.bottomLeft>=max)distance.bottomLeft = max;
	if(distance.topRight>=max)distance.topRight = max;
	if(distance.bottomRight>=max)distance.bottomRight = max;
	// console.log(distance);

	var volTopLeft = map(distance.topLeft, max, 0.0, 1.0);
	var volTopRight = map(distance.topRight, max, 0.0, 1.0);
	var volBottomLeft = map(distance.bottomLeft, max, 0.0, 1.0);
	var volBottomRight = map(distance.bottomRight, max, 0.0, 1.0);

	var volMiddle = map(distance.middle, max, 0.0,1.0);

	topLeft.volume = volTopLeft*volMult;
	topRight.volume = volTopRight*volMult;
	bottomLeft.volume = volBottomLeft*volMult;
	bottomRight.volume = volBottomRight*volMult;
	middle.volume = volMiddle*volMult;

	topLeft.play();
	topRight.play();
	bottomLeft.play();
	bottomRight.play();
	middle.play();
}

function onKeyDown( event ){
	if( event.keyCode == "32"){
		screenshot();
		
	function screenshot(){
		// var i = renderer.domElement.toDataURL('image/png');
		var blob = dataURItoBlob(renderer.domElement.toDataURL('image/png'));
		var file = window.URL.createObjectURL(blob);
		var img = new Image();
		img.src = file;
	    img.onload = function(e) {
		    // window.URL.revokeObjectURL(this.src);
		    window.open(this.src);

	    }
		 // window.open(i)
		// insertAfter(img, );
	}
	//
			function dataURItoBlob(dataURI) {
			    // convert base64/URLEncoded data component to raw binary data held in a string
			    var byteString;
			    if (dataURI.split(',')[0].indexOf('base64') >= 0)
			        byteString = atob(dataURI.split(',')[1]);
			    else
			        byteString = unescape(dataURI.split(',')[1]);

			    // separate out the mime component
			    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

			    // write the bytes of the string to a typed array
			    var ia = new Uint8Array(byteString.length);
			    for (var i = 0; i < byteString.length; i++) {
			        ia[i] = byteString.charCodeAt(i);
			    }

			    return new Blob([ia], {type:mimeString});
			}
			function insertAfter(newNode, referenceNode) {
			    referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
			}
		}
}


