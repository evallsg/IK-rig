import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { FABRIKSolver, CCDIKSolver } from './IKSolver.js'
import { IKCompute, IKRig, IKPose, IKSolver, IKVisualize } from './IKRig.js';
import { BipedRig } from './IKRigs.js'
import { BipedFBIK } from './FullBodyIK.js';

const FORWARD = new THREE.Vector3(0,0,1);
const UP =  new THREE.Vector3(0,1,0);
const DOWN = new THREE.Vector3(0,-1,0);
const BACK = new THREE.Vector3(0,0,-1);
const LEFT = new THREE.Vector3(1,0,0);
const RIGHT =  new THREE.Vector3(-1,0,0);

class App {
    constructor() {
        this.elapsedTime = 0; // clock is ok but might need more time control to dinamicaly change signing speed
        this.clock = new THREE.Clock();
        this.loaderGLB = new GLTFLoader();
        this.loadedCharacters = {};
        this.sourceName = "nabba.gltf";
        this.targetName = "ReadyPlayerEva.glb";

        this.playing = false;
    }

    init() {
        this.initScene();
        IKVisualize.sourceName = this.sourceName;
        IKVisualize.targetName = this.targetName;
        this.loadAvatar("./data/" + this.sourceName, this.sourceName, true, () => {

            // this.initRig(this.sourceName, true);
            const source = this.loadedCharacters[this.sourceName];
            
            this.srcRig = new BipedRig();
            let skeleton = cloneRawSkeleton( source.skeleton, 0, true);
            this.srcRig.autorig(skeleton);
            this.srcRig.useSolversForFBIK( skeleton );

            this.ikRig = new BipedFBIK( this.srcRig );
            this.ikRig.bindPose( skeleton, true );
            this.ikRig.defineRenderLines();

            this.lines = [];
            
            const lmaterial = new THREE.LineBasicMaterial( { color: 0x0000ff, depthTest: false } );
            for(let i = 0; i < this.ikRig.lines.length; i++) {
                const geometry = new THREE.BufferGeometry().setFromPoints( [this.ikRig.lines[i][0].position, this.ikRig.lines[i][1].position] );
                const line = new THREE.Line( geometry, lmaterial );
                this.lines.push(line);
                this.scene.add(line);
            }

            let geometry = new THREE.SphereGeometry(0.1, 32, 16 ); 
            let material = new THREE.MeshNormalMaterial( { color: 'red', depthTest: false } ); 

            this.controlPoints = [];
            for(let i = 0; i < this.ikRig.skeleton.points.length; i++) {
                const point = this.ikRig.skeleton.points[i];
                const sphere = this.controller = new THREE.Mesh( geometry, material );
                sphere.position.copy(point.position) 
                sphere.scale.set(0.1,0.1,0.1);
                this.scene.add( sphere );
                sphere.pointId = i;
                this.controlPoints.push(sphere);
            }

            this.ikRig.resolve();
            this.ikRig.updateRigTargets();
         
            this.controller =  new TransformControls( this.camera, this.renderer.domElement );
            this.controller.addEventListener( 'dragging-changed',  ( event ) => { 
                this.controls.enabled = ! event.value; 
            } );
            this.controller.addEventListener( 'objectChange',  ( event ) => { 
                this.updatePose(event.target.object.pointId, event.target.object.position);
            } );
          
            this.controller.size = 0.3;
            this.controller.name = "control";
            // this.controller.mode = "rotate";
            this.scene.add( this.controller  );

            // this.updatePose();
            window.addEventListener("mousedown", this.checkCollision.bind(this));
            this.animate();
        });
    }

    checkCollision( event ) {
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	    pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
        
        raycaster.setFromCamera( pointer, this.camera );
        const intersects = raycaster.intersectObjects( this.controlPoints );

        for ( let i = 0; i < intersects.length; i ++ ) {

            this.controller.attach( intersects[ i ].object );
            const point = this.ikRig.skeleton.points[intersects[ i ].object.pointId];
            console.log(point.name)
        }
    }

    updatePose(idx, position) {
        if(idx == undefined) {
            return;
        }
        const source = this.loadedCharacters[this.sourceName];
        const point = this.ikRig.skeleton.points[idx];
        this.ikRig.skeleton.setPosition(idx, position);
        if( !point.isPole ) {
            this.ikRig.resolve();
        }
        else {
            this.ikRig.resolveForPole( idx );
        }
        this.ikRig.updateRigTargets();
        this.srcRig.resolveToPose( source.skeleton, true );

        for(let i = 0; i < this.ikRig.lines.length; i++) {            
            this.lines[i].geometry.setFromPoints([this.ikRig.lines[i][0].position, this.ikRig.lines[i][1].position]);
        }        
    }

    initScene() {
        this.scene = new THREE.Scene();
        const sceneColor = this.sceneColor = 0x4f4f9c;
        this.scene.background = new THREE.Color( sceneColor );

        // Create transparent ground for Open space
        const ground = this.ground = new THREE.Mesh( new THREE.PlaneGeometry(20,20), new THREE.MeshStandardMaterial( { color: this.sceneColor, opacity: 0.1, transparent:false, depthWrite: true, roughness: 1, metalness: 0 } ) );
        ground.name = 'Ground'
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add( ground );

        // renderer
        this.renderer = new THREE.WebGLRenderer( { antialias: true } );
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.setSize( window.innerWidth, window.innerHeight );

        this.renderer.toneMapping = THREE.LinearToneMapping;
        this.renderer.toneMappingExposure = 1;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.VSMShadowMap;
        
        // camera
        this.createCamera();
   
        // lights
        this.createLights();

        this.renderer.render( this.scene, this.camera ); 

        window.document.body.appendChild(this.renderer.domElement);

        // Create event listeners
        window.addEventListener( 'resize', this.onWindowResize.bind(this) );
    }
    
    createCamera() {
        let camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.01, 1000);
        camera.position.set(0,1.2,3);
        let controls = new OrbitControls( camera, this.renderer.domElement );
        controls.target.set(0, 1, 0);
        controls.enableDamping = true; // this requires controls.update() during application update
        controls.dampingFactor = 0.1;
        controls.enabled = true;
        controls.update();

        this.camera = camera;
        this.controls = controls    
    }

    createLights() {
        const hemiLight = new THREE.HemisphereLight( 0xffffff, 0xffffff, 0.5 );
        this.scene.add( hemiLight );

        const keySpotlight = new THREE.SpotLight( 0xffffff, 3.5, 0, 45 * (Math.PI/180), 0.5, 2 );
        keySpotlight.position.set( 0.5, 2, 2 );
        keySpotlight.target.position.set( 0, 1, 0 );
        this.scene.add( keySpotlight.target );
        this.scene.add( keySpotlight );

        const fillSpotlight = new THREE.SpotLight( 0xffffff, 2.0, 0, 45 * (Math.PI/180), 0.5, 2 );
        fillSpotlight.position.set( -0.5, 2, 1.5 );
        fillSpotlight.target.position.set( 0, 1, 0 );
        // fillSpotlight.castShadow = true;
        this.scene.add( fillSpotlight.target );
        this.scene.add( fillSpotlight );

        const dirLight = this.dirLight = new THREE.DirectionalLight( 0xffffff, 2 );
        dirLight.position.set( 1.5, 5, 2 );
        dirLight.shadow.mapSize.width = 512;
        dirLight.shadow.mapSize.height = 512;
        dirLight.shadow.camera.left= -5;
        dirLight.shadow.camera.right= 5;
        dirLight.shadow.camera.bottom= -5;
        dirLight.shadow.camera.top= 5;
        dirLight.shadow.camera.near= 0.5;
        dirLight.shadow.camera.far= 20;
        dirLight.shadow.blurSamples= 10;
        dirLight.shadow.radius= 3;
        dirLight.shadow.bias = 0.00001;
        dirLight.castShadow = true;
        this.scene.add( dirLight );
    }

    onWindowResize() {       
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize( window.innerWidth, window.innerHeight );
    }

    loadAvatar( filePath, avatarName, useAnimations = false, callback = null, onerror = null ) {
        this.loaderGLB.load( filePath, async (glb) => {
            let model = glb.scene;
           
            model.castShadow = true;
            let skeleton = null;
            const bones = [];
            model.traverse( (object) => {
                if ( object.isMesh || object.isSkinnedMesh ) {
                    if (object.skeleton){
                        skeleton = object.skeleton; 
                    }
                    object.material.side = THREE.FrontSide;
                    object.frustumCulled = false;
                    object.castShadow = true;
                    object.receiveShadow = true;
                    if (object.name == "Eyelashes") {
                        object.castShadow = false;
                    }
                    if(object.material.map) {
                        object.material.map.anisotropy = 16;
                    }
                } else if (object.isBone) {
                    object.scale.set(1.0, 1.0, 1.0);
                    bones.push(object);
                }
            });
                
            if(!skeleton) {
                // skeleton = new THREE.Skeleton(bones);
                bones[0].updateWorldMatrix( false, true ); // assume 0 is root
                skeleton = new THREE.Skeleton( bones ); // will automatically compute boneInverses
            }            
            model.name = avatarName;
            let skeletonHelper = new THREE.SkeletonHelper(model);
            this.loadedCharacters[avatarName] ={
                model, skeleton, skeletonHelper
            }
            skeleton.pose();

            if(useAnimations && glb.animations.length) {
                // let tracks = [];
                // let names = ["RightHandThumb1", "RightHandThumb2", "RightHandThumb3", "RightHandIndex1", "RightHandIndex2", "RightHandIndex3", "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3", "RightHandRing1", "RightHandRing2", "RightHandRing3",  "RightHandPinky1", "RightHandPinky2", "RightHandPinky3"]
                // for(let i = 0; i < glb.animations[0].tracks.length; i++) {
                //     for(let j = 0; j < names.length; j++) {
                //         if(glb.animations[0].tracks[i].name.includes(names[j])) {
                //             tracks.push(glb.animations[0].tracks[i]);
                //             break;
                //         }

                //     }
                // }
                // glb.animations[0].tracks = tracks;
                // this.mixer = new THREE.AnimationMixer(skeleton.bones[0]);
                // this.mixer.clipAction(glb.animations[0]).setEffectiveWeight(1.0).play();
                // this.mixer.update(0.1);
            }

            this.scene.add(model);
            this.scene.add(skeletonHelper);

            if(callback) {
                callback();
            }
        }, null, (err) => {
            if(onerror) {
                onerror(err);
            }                 
        });
    }

    animate() {

        requestAnimationFrame( this.animate.bind(this) );
        
        this.controls.update(); // needed because of this.controls.enableDamping = true
        let delta = this.clock.getDelta()         
        
        this.elapsedTime += delta;
        this.update(delta);
        
        this.renderer.render( this.scene, this.camera );
    }

    update(dt) {
        // IKCompute.run(this.loadedCharacters[this.sourceName].IKrig, this.loadedCharacters[this.sourceName].IKPose)
        //IKCompute.run(this.rig, this.loadedCharacters[this.sourceName].IKPose);

        // this.loadedCharacters[this.sourceName].IKPose.applyRig(this.rig);
    }

    
}

export {App}


 /**
     * creates a Transform object with identity values
     * @returns Transform
     */
 function _newTransform(){ return { p: new THREE.Vector3(0,0,0), q: new THREE.Quaternion(0,0,0,1), s: new THREE.Vector3(1,1,1) }; }

 /**
  * Deep clone of the skeleton. New bones are generated. Skeleton's parent objects will not be linked to the cloned one
  * Returned skeleton has new attributes: 
  *  - Always: .parentIndices, .transformsWorld, .transformsWorldInverses
  *  - embedWorld == true:  .transformsWorldEmbedded
  * @param {THREE.Skeleton} skeleton 
  * @returns {THREE.Skeleton}
  */
 const CURRENT = 1;
 function cloneRawSkeleton( skeleton, poseMode, embedWorld = false ) {
     let bones = skeleton.bones;
    
     let resultBones = new Array( bones.length );
     let parentIndices = new Int16Array( bones.length );

     // bones[0].clone( true ); // recursive
     for( let i = 0; i < bones.length; ++i ){
         resultBones[i] = bones[i].clone(false);
         resultBones[i].parent = null;
     }
     
     for( let i = 0; i < bones.length; ++i ){
         let parentIdx = findIndexOfBone( skeleton, bones[i].parent )
         if ( parentIdx > -1 ){ resultBones[ parentIdx ].add( resultBones[ i ] ); }
         
         parentIndices[i] = parentIdx;
     }

     resultBones[0].updateWorldMatrix( false, true ); // assume 0 is root. Update all global matrices (root does not have any parent)
     
     // generate skeleton
     let resultSkeleton;
     switch(poseMode) {
         case CURRENT: 
             resultSkeleton = new THREE.Skeleton( resultBones ); // will automatically compute the inverses from the matrixWorld of each bone               
             
             break;
         default:
             let boneInverses = new Array( skeleton.boneInverses.length );
             for( let i = 0; i < boneInverses.length; ++i ) { 
                 boneInverses[i] = skeleton.boneInverses[i].clone(); 
             }
             resultSkeleton = new THREE.Skeleton( resultBones, boneInverses );
             resultSkeleton.pose();
             break;
     }
     
     resultSkeleton.parentIndices = parentIndices; // add this attribute to the THREE.Skeleton class

     // precompute transforms (forward and inverse) from world matrices
     let transforms = new Array( skeleton.bones.length );
     let transformsInverses = new Array( skeleton.bones.length );
     for( let i = 0; i < transforms.length; ++i ){
         let t = _newTransform();
         resultSkeleton.bones[i].matrixWorld.decompose( t.p, t.q, t.s );
         transforms[i] = t;
         
         t = _newTransform();
         resultSkeleton.boneInverses[i].decompose( t.p, t.q, t.s );
         transformsInverses[i] = t;
     }
     resultSkeleton.transformsWorld = transforms;
     resultSkeleton.transformsWorldInverses = transformsInverses;

     // embedded transform
     if ( embedWorld && bones[0].parent ){
         let embedded = { forward: _newTransform(), inverse: _newTransform() };
         let t = embedded.forward;
         bones[0].parent.updateWorldMatrix( true, false );
         bones[0].parent.matrixWorld.decompose( t.p, t.q, t.s );
         t = embedded.inverse;
         skeleton.bones[0].parent.matrixWorld.clone().invert().decompose( t.p, t.q, t.s );
         resultSkeleton.transformsWorldEmbedded = embedded;
     }
     return resultSkeleton;
 }

 // O(n)
function findIndexOfBone( skeleton, bone ){
    if ( !bone ){ return -1;}
    let b = skeleton.bones;
    for( let i = 0; i < b.length; ++i ){
        if ( b[i] == bone ){ return i; }
    }
    return -1;
}