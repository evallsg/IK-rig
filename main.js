import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FABRIKSolver, CCDIKSolver } from './IKSolver.js'
import { applyTPose } from './retargeting.js';

// O(nm)
function findIndexOfBoneByName( skeleton, name ){
    if ( !name ){ return -1; }
    let b = skeleton.bones;
    for( let i = 0; i < b.length; ++i ){
        if ( b[i].name.replace( "mixamorig_", "" ).replace("mixamorig:", "").replace( "mixamorig", "" ) == name ){ return i; }
    }
    return -1;
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

const CURRENT = 1;
const EPSILON = (0.01 * Math.PI / 180);

class App {
    constructor() {
        this.elapsedTime = 0; // clock is ok but might need more time control to dinamicaly change signing speed
        this.clock = new THREE.Clock();
        this.loaderGLB = new GLTFLoader();
        this.loadedCharacters = {};
        this.sourceName = "bmlTest";
        this.targetName = "Ada";

        this.playing = false;
    }

    init() {
        this.initScene();

        this.loadAvatar("./data/" + this.sourceName + ".glb", this.sourceName, true, () => {

            // this.initRig(this.sourceName, true);
            const source = this.loadedCharacters[this.sourceName];
            let rig = new IKRig();
            rig.init(source.skeleton, true, false);
            source.IKPose = new IKPose();
            source.IKrig = rig;
            IKCompute.run(rig, source.IKPose);
            IKVisualize.run(rig, source.IKPose, this.scene, this.sourceName);

            this.loadAvatar("./data/" +this.targetName + ".glb", this.targetName, false, () => {
                this.loadedCharacters[this.targetName].model.position.x = 0.5;

                const current = this.loadedCharacters[this.targetName];
                let rig = new IKRig();
                current.skeleton.pose();
                rig.init(current.skeleton, true, false, this.targetName == "robo_trex" ? 0 : 1);

                if(this.targetName == "robo_trex") {
                    rig.addPoint( "hip", "hip" )
                    rig.addPoint( "head", "face_joint" )
                    rig.addPoint( "foot_l", "LeftFoot" )
                    rig.addPoint( "foot_r", "RightFoot" )

                    rig.addPoint( "wing_l", "left_wing" )
                    rig.addPoint( "wing_r", "right_wing" )

                    rig.addChain( "leg_r", [ "RightUpLeg", "RightKnee", "RightShin" ], "RightFoot", "three_bone" ) //"z", 
                    rig.addChain( "leg_l", [ "LeftUpLeg", "LeftKnee", "LeftShin" ], "LeftFoot", "three_bone" ) // "z", 
                    rig.addChain( "spine", [ "Spine", "Spine1" ] )
                    rig.addChain( "tail", ["tail_1","tail_2","tail_3","tail_4","tail_5","tail_6","tail_7"] )
                    // .set_leg_lmt( null, -0.1 )
                }
                current.IKPose = new IKPose();
                
                current.IKrig = rig;
                
                source.IKPose.applyRig(rig, current.IKPose);
                IKCompute.run(rig, current.IKPose);
                if(rig.ikSolver) {
                    rig.ikSolver.update();
                }
                IKVisualize.run(rig, current.IKPose, this.scene, this.targetName);
                this.animate();

                window.addEventListener("keyup", (event) => {
                    switch(event.key) {
                        case " ":
                            this.playing = !this.playing;
                            break;
                    
                        case "Escape":
                            this.mixer.setTime(0.01);
                            this.retarget();
                            break;
                        
                        case "ArrowRight":
                            this.mixer.update(0.01);
                            this.retarget();
                            break;

                        case "ArrowLeft":
                            this.mixer.update(-0.01);
                            this.retarget();
                            break;
                    }                    
                })
            })
        },);

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
                this.mixer = new THREE.AnimationMixer(skeleton.bones[0]);
                this.mixer.clipAction(glb.animations[0]).setEffectiveWeight(1.0).play();
                this.mixer.update(0.1);
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
        if(this.mixer && this.playing) {
            this.mixer.update(dt*0.5);
            this.retarget();
        }
    }

    retarget() {
        IKCompute.run(this.loadedCharacters[this.sourceName].IKrig, this.loadedCharacters[this.sourceName].IKPose);
        IKVisualize.run(this.loadedCharacters[this.sourceName].IKrig, this.loadedCharacters[this.sourceName].IKPose, this.scene, this.sourceName);
        this.loadedCharacters[this.sourceName].IKPose.applyRig(this.loadedCharacters[this.targetName].IKrig);
        
        if(this.loadedCharacters[this.targetName].IKrig.ikSolver) {
            this.loadedCharacters[this.targetName].IKrig.ikSolver.update();
        }
        IKCompute.run(this.loadedCharacters[this.targetName].IKrig, this.loadedCharacters[this.targetName].IKPose);

        IKVisualize.run(this.loadedCharacters[this.targetName].IKrig, this.loadedCharacters[this.targetName].IKPose, this.scene, this.targetName);
    }
}

export {App}

let FORWARD = new THREE.Vector3(0,0,1);
let UP =  new THREE.Vector3(0,1,0);
let DOWN = new THREE.Vector3(0,-1,0);
let BACK = new THREE.Vector3(0,0,-1);
let LEFT = new THREE.Vector3(1,0,0);
let RIGHT =  new THREE.Vector3(-1,0,0);

class IKRig {
    static ARM_MIXAMO = 1;

    constructor() {
        this.skeleton = null; // reference back to armature component
        this.tpose = null; // TPose (better for IK) or Bind Pose 
        this.pose = null; // Pose to manipulate before applying to bone entities
        this.chains = {}; // Bone chains: limbs, spine, hair, tail...
        this.points = {}; // Main single bones of the Rig: head, hip, chest...

        this.leg_len_lmt = 0;
        this.ikSolver = null;
    }

    applyPose(){ 
        this.pose.apply(); 
    }
	
    updateWorld(){ 
        this.pose.updateWorld(); 
    }

    init(skeleton, useNodeOffset = false, forceTpose = false, type = IKRig.ARM_MIXAMO) {
        this.skeleton = skeleton;
        let mode = 0;
        if(forceTpose) {
            skeleton = applyTPose(skeleton).skeleton;
            mode = 1;
        }
        this.tpose = this.cloneRawSkeleton( skeleton, mode, useNodeOffset );
        this.tpose.pose(); // returns pure skeleton, without any object model applied 
        this.pose = this.skeleton;//this.cloneRawSkeleton( skeleton, null, useNodeOffset ); // returns pure skeleton, without any object model applied 
            // this.pose.pose();
        // this.ikSolver = new CCDIKSolver(this.skeleton);
        // this.ikSolver.setIterations(10);
        switch( type ){
			case IKRig.ARM_MIXAMO : this.initMixamoRig( this.skeleton, this ); break;
		}


		return this;
    }

    addPoint(name, boneName) {
        this.points[ name ] = {
            idx: findIndexOfBoneByName( this.skeleton, boneName )
        }
        return this;
    }

    addChain(name, arrayNames, endEffectorName = null, multi = false, constraints = [], ikSolver = null) {

        let bones = [];
        let bonesInfo = [];
        let totalLength = 0;
        for(let i = 0; i < arrayNames.length; i ++) {
            const idx = findIndexOfBoneByName(this.skeleton, arrayNames[i]);
            let len = 0;
            if(i > 0) {
                
                let parentPos = this.skeleton.bones[bonesInfo[i-1].idx].getWorldPosition(new THREE.Vector3());
                let pos = this.skeleton.bones[idx].getWorldPosition(new THREE.Vector3());
        
                if(this.pose.transformsWorldEmbedded) {
                    let cmat = new THREE.Matrix4().compose(this.pose.transformsWorldEmbedded.forward.p, this.pose.transformsWorldEmbedded.forward.q, this.pose.transformsWorldEmbedded.forward.s);
                    let mat = this.skeleton.bones[bonesInfo[i-1].idx].matrix.clone();
                    mat.premultiply(cmat);
                    mat.decompose(parentPos, new THREE.Quaternion(), new THREE.Vector3());

                    mat = this.skeleton.bones[idx].matrix.clone();
                    mat.premultiply(cmat);
                    mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
                }
                len = parentPos.distanceTo(pos);
                totalLength += len;
                bonesInfo[i-1].len = len;
            }
            bonesInfo.push({idx, len:0});
            bones.push(idx);
        }

        let endEffector = bones[bones.length-1];
        if(endEffectorName) {
            endEffector = findIndexOfBoneByName(this.skeleton, endEffectorName);
            if(endEffector > -1) {
                const parentPos = this.skeleton.bones[bonesInfo[bonesInfo.length-1].idx].getWorldPosition(new THREE.Vector3());
                const pos = this.skeleton.bones[endEffector].getWorldPosition(new THREE.Vector3());
                if(this.pose.transformsWorldEmbedded) {
                    let cmat = new THREE.Matrix4().compose(this.pose.transformsWorldEmbedded.forward.p, this.pose.transformsWorldEmbedded.forward.q, this.pose.transformsWorldEmbedded.forward.s);
                    let mat = this.skeleton.bones[bonesInfo[i-1].idx].matrix.clone();
                    mat.premultiply(cmat);
                    mat.decompose(parentPos, new THREE.Quaternion(), new THREE.Vector3());

                    mat = this.skeleton.bones[idx].matrix.clone();
                    mat.premultiply(cmat);
                    mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
                }
                const len = parentPos.distanceTo(pos);
                bonesInfo[bonesInfo.length-1].len = len;
                bonesInfo.push({idx: endEffector, len: 0});
                bones.push(endEffector);
                totalLength += len;
            }
        }

        const target = new THREE.Object3D();
        target.position.copy(this.skeleton.bones[bonesInfo[bonesInfo.length-1].idx].getWorldPosition(new THREE.Vector3()));

        this.chains[ name ] =  {
            name: name,
            bones: bonesInfo, 
            constraints: constraints,
            target: target,
            alt_forward: FORWARD.clone(),
            alt_up: UP.clone(),
            length: totalLength
        }

        // IK SOLVER:
        // if ( !character.FABRIKSolver ){ character.FABRIKSolver = new FABRIKSolver( character.skeleton ); }
        if(ikSolver) {
            ikSolver.createChain(bones.reverse(), this.chains[ name ].constraints, this.chains[ name ].target, this.chains[ name ].name);
        }else {
            this.chains[ name ].ikSolver = new IKSolver(this.tpose, this.chains[ name ], multi);
        }
        //this.addChain(character, {name:name, origin: bones[0], endEffector }, null, new THREE.Vector3(1,1,0));
    }

    setAlternatives(chainName, forward, up, tpose = null) {
        let f = forward.clone();
        let u = up.clone();
        if( tpose ){
			let bone = tpose.bones[ this.chains[chainName].bones[ 0 ].idx ];
            let q = bone.getWorldQuaternion(new THREE.Quaternion());
            
            if(tpose.transformsWorldEmbedded) {
                q.premultiply(tpose.transformsWorldEmbedded.forward.q)
            }
            q.invert();	// Invert World Space Rotation 

			this.chains[chainName].alt_forward = f.applyQuaternion(q);	// Use invert to get direction that will Recreate the real direction
			this.chains[chainName].alt_up = u.applyQuaternion(q);	
		}else{
			this.chains[chainName].alt_forward.copy( f );
			this.chains[chainName].alt_up.copy( u );
		}
		return this;
    }

    initMixamoRig( skeleton, rig ){
        
        rig.addPoint( "hip", "Hips" )
        rig.addPoint( "head", "Head" )
        rig.addPoint( "neck", "Neck" )
        rig.addPoint( "chest", "Spine2" )
        rig.addPoint( "foot_l", "LeftFoot" )
        rig.addPoint( "foot_r", "RightFoot" )
    
        rig.addChain( "arm_r", [ "RightArm", "RightForeArm" ],  "RightHand")
        rig.addChain( "arm_l", [ "LeftArm", "LeftForeArm" ], "LeftHand") 
    
        rig.addChain( "leg_r", [ "RightUpLeg", "RightLeg" ], "RightFoot")
        rig.addChain( "leg_l", [ "LeftUpLeg", "LeftLeg" ], "LeftFoot")
    
        rig.addChain( "spine", [ "Spine", "Spine1", "Spine2" ] ) //, "y"
        
        rig.addChain( "thumb_r", [ "RightHandThumb1", "RightHandThumb2", "RightHandThumb3" ], "RightHandThumb4", true ) //, "y"
        rig.addChain( "index_r", [ "RightHandIndex1", "RightHandIndex2", "RightHandIndex3" ], "RightHandIndex4", true ) //, "y"
        rig.addChain( "middle_r", [ "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3" ], "RightHandMiddle4", true ) //, "y"
        rig.addChain( "ring_r", [ "RightHandRing1", "RightHandRing2", "RightHandRing3" ], "RightHandRing4", true ) //, "y"
        rig.addChain( "pinky_r", [ "RightHandPinky1", "RightHandPinky2", "RightHandPinky3" ], "RightHandPinky4", true ) //, "y"
        
    
        // Set Direction of Joints on th Limbs   
        rig.setAlternatives( "leg_l", DOWN, FORWARD, rig.tpose );
        rig.setAlternatives( "leg_r", DOWN, FORWARD, rig.tpose );
        rig.setAlternatives( "arm_l", LEFT, BACK, rig.tpose );
        rig.setAlternatives( "arm_r", RIGHT, BACK, rig.tpose );
        rig.setAlternatives( "thumb_r", RIGHT, BACK, rig.tpose );
        rig.setAlternatives( "index_r", RIGHT, BACK, rig.tpose );
        rig.setAlternatives( "middle_r", RIGHT, BACK, rig.tpose );
        rig.setAlternatives( "ring_r", RIGHT, BACK, rig.tpose );
        rig.setAlternatives( "pinky_r", RIGHT, BACK, rig.tpose );
    }

    /**
     * creates a Transform object with identity values
     * @returns Transform
     */
    _newTransform(){ return { p: new THREE.Vector3(0,0,0), q: new THREE.Quaternion(0,0,0,1), s: new THREE.Vector3(1,1,1) }; }

    /**
     * Deep clone of the skeleton. New bones are generated. Skeleton's parent objects will not be linked to the cloned one
     * Returned skeleton has new attributes: 
     *  - Always: .parentIndices, .transformsWorld, .transformsWorldInverses
     *  - embedWorld == true:  .transformsWorldEmbedded
     * @param {THREE.Skeleton} skeleton 
     * @returns {THREE.Skeleton}
     */
    cloneRawSkeleton( skeleton, poseMode, embedWorld = false ){
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
            let t = this._newTransform();
            resultSkeleton.bones[i].matrixWorld.decompose( t.p, t.q, t.s );
            transforms[i] = t;
            
            t = this._newTransform();
            resultSkeleton.boneInverses[i].decompose( t.p, t.q, t.s );
            transformsInverses[i] = t;
        }
        resultSkeleton.transformsWorld = transforms;
        resultSkeleton.transformsWorldInverses = transformsInverses;

        // embedded transform
        if ( embedWorld && bones[0].parent ){
            let embedded = { forward: this._newTransform(), inverse: this._newTransform() };
            let t = embedded.forward;
            bones[0].parent.updateWorldMatrix( true, false );
            bones[0].parent.matrixWorld.decompose( t.p, t.q, t.s );
            t = embedded.inverse;
            skeleton.bones[0].parent.matrixWorld.clone().invert().decompose( t.p, t.q, t.s );
            resultSkeleton.transformsWorldEmbedded = embedded;
        }
        return resultSkeleton;
    }
}

class IKPose {
    constructor() {
        this.hip = {
            bindHeight: 0, // Use to Scale movement
            movement: new THREE.Vector3(), // How much movement the Hip did in world space
            direction: new THREE.Vector3(), // Swing
            twist: 0 //Twist
        }

        // lengthScale: scaled lenght to the end effector, plus the direction that the knee or elbow is pointing
        // direction: for IK, is FORWARD (direction of the root to the end)
        // jointDirection: for IK, is UP (direction of the limb (knee or elbow))
        this.leftLeg =  {lengthScale: 0, direction: new THREE.Vector3(), jointDirection: new THREE.Vector3()}
        this.rightLeg = {lengthScale: 0, direction: new THREE.Vector3(), jointDirection: new THREE.Vector3()}
        this.leftArm =  {lengthScale: 0, direction: new THREE.Vector3(), jointDirection: new THREE.Vector3()}
        this.rightArm = {lengthScale: 0, direction: new THREE.Vector3(), jointDirection: new THREE.Vector3()}    
        this.rightThumb = {lengthScale: 0, direction: new THREE.Vector3(), jointDirection: new THREE.Vector3()}    
        this.rightIndex = {lengthScale: 0, direction: new THREE.Vector3(), jointDirection: new THREE.Vector3()}    
        this.rightMiddle = {lengthScale: 0, direction: new THREE.Vector3(), jointDirection: new THREE.Vector3()}    
        this.rightRing = {lengthScale: 0, direction: new THREE.Vector3(), jointDirection: new THREE.Vector3()}    
        this.rightPinky = {lengthScale: 0, direction: new THREE.Vector3(), jointDirection: new THREE.Vector3()}    
        
        this.leftFoot = {look: new THREE.Vector3(), twist: new THREE.Vector3()};
        this.rightFoot = {look: new THREE.Vector3(), twist: new THREE.Vector3()};

        this.spine = [ 
            { look: new THREE.Vector3(), twist: new THREE.Vector3()}, // First control point of rotation
            { look: new THREE.Vector3(), twist: new THREE.Vector3()}, // Second control point of rotation
            { look: new THREE.Vector3(), twist: new THREE.Vector3()} 
        ];

        this.neck = {look: new THREE.Vector3(), twist: new THREE.Vector3()};
        this.head = {look: new THREE.Vector3(), twist: new THREE.Vector3()};

    }

    applyRig( rig, pose ) {
        // this.applyHip(rig);
        
        // // Legs
        // this.applyLimb(rig, rig.chains.leg_l, this.leftLeg, 0);
        // this.applyLimb(rig, rig.chains.leg_r, this.rightLeg, 0);
        // //Feet
        // this.applyLookTwist( rig, rig.points.foot_l, this.leftFoot, FORWARD, UP );
        // this.applyLookTwist( rig, rig.points.foot_r, this.rightFoot, FORWARD, UP );
        // // Spine
        // this.applySpine(rig, rig.chains.spine, this.spine, UP, FORWARD);
        // Arms
        this.applyLimb(rig, rig.chains.thumb_r, this.rightThumb);
        this.applyLimb(rig, rig.chains.index_r, this.rightIndex);
        this.applyLimb(rig, rig.chains.middle_r, this.rightIndex);
        this.applyLimb(rig, rig.chains.ring_r, this.rightRing);
        this.applyLimb(rig, rig.chains.pinky_r, this.rightPinky);
        // this.applyLimb(rig, rig.chains.arm_l, this.leftArm);
        // this.applyLimb(rig, rig.chains.arm_r, this.rightArm);

        this.applyLookTwist( rig, rig.points.neck, this.neck, FORWARD, UP );
        this.applyLookTwist( rig, rig.points.head, this.head, FORWARD, UP );
    }

    applyHip(rig) {
 
        const boneInfo = rig.points.hip;
        const bind = rig.tpose.bones[boneInfo.idx]; // Hips in bind pose
        const pose = rig.pose.bones[boneInfo.idx]; // Hips in current pose

        // ROTATION
        // Apply IK swing and twist
        let pWorldRotation = pose.parent.getWorldQuaternion(new THREE.Quaternion());
        if(rig.pose.transformsWorldEmbedded) { 
            pWorldRotation.premultiply(rig.pose.transformsWorldEmbedded.q);
        }

        let boneRotation = new THREE.Quaternion().multiplyQuaternions(pWorldRotation, bind.quaternion); // Apply WS current rotation to LS bind rotation to get it in WS
        let swing = new THREE.Quaternion().setFromUnitVectors(FORWARD, this.hip.direction); // Create swing rotation
        swing.multiply(boneRotation); // Apply swing to new WS bind rotation

        if(this.hip.twist != 0) {
            // If there's a twist angle, apply that rotation
            const q = new THREE.Quaternion().setFromAxisAngle(this.hip.direction, this.hip.twist);
            swing.premultiply(q);
        }
        swing.premultiply(pWorldRotation.invert()); // Convert the new WS bind rotation to LS multiplying the inverse rotation of the parent
        pose.quaternion.copy(swing);

        // TRANSLATION
        let bWorldPosition = bind.getWorldPosition(new THREE.Vector3());
        if(rig.tpose.transformsWorldEmbedded) {
            let mat = bind.matrixWorld.clone();
            let cmat = new THREE.Matrix4().compose(rig.tpose.transformsWorldEmbedded.forward.p, rig.tpose.transformsWorldEmbedded.forward.q, rig.tpose.transformsWorldEmbedded.forward.s);
            mat.premultiply(cmat);
            mat.decompose(bWorldPosition, new THREE.Quaternion(), new THREE.Vector3());
        }
        const hipScale = bWorldPosition.y/this.hip.bindHeight; // Scale value from source's hip height and target's hip height
        let pos = new THREE.Vector3().copy(this.hip.movement).multiplyScalar(hipScale); // Scale the translation difference to mathc this model's scale
        pos.add(bWorldPosition); // Add that scaled different to the bind pose position

        pose.position.copy(pos);
    }

    applyLimb(rig, chain, limb, grounding = 0) {
        const chainBones = chain.bones;
        const rootBone = rig.tpose.bones[chainBones[0].idx];
        let rootWorldPos = rootBone.getWorldPosition(new THREE.Vector3());

        if(rig.tpose.transformsWorldEmbedded) {
            let mat = rig.tpose.bones[chainBones[0].idx].matrixWorld.clone();
            let cmat = new THREE.Matrix4().compose(rig.tpose.transformsWorldEmbedded.forward.p, rig.tpose.transformsWorldEmbedded.forward.q, rig.tpose.transformsWorldEmbedded.forward.s);
            mat.premultiply(cmat);
            mat.decompose(rootWorldPos, new THREE.Quaternion(), new THREE.Vector3());
        }

        // leg_len_lmt: limit the extension of the chain (sometimes it's never full extended)
        // How much of the chain length to use to compute End effector position
        const len = (rig.leg_len_lmt || chain.length) * limb.lengthScale;
        // Pass into the target, which does a some pre computations
        chain.target.position.copy(limb.direction.normalize()).multiplyScalar(len).add(rootWorldPos);

        if(grounding) {
            this.applyGrounding(grounding, chain, rootWorldPos);
        }

        if(!rig.ikSolver) {
            chain.ikSolver.solve(rig.pose, limb.direction, limb.jointDirection);
        }
    }

    applyGrounding( limit, chain, rootPos ) {
        // Check if the end effector is below the height limit
        const targetPos = chain.target.position;
        if(targetPos.y >= limit) {
            return;
        }

        // Normalize Limit value in the Max/Min range of Y
        let normLimit = ( limit - rootPos.y ) / (targetPos.y - rootPos.y);
        
        // Change the end effector of the target: scale the range of X and Z of the chain and apply them to the start position of the chain, and put the Y in the height limit
        chain.target.position.set(rootPos.x * (1 - normLimit) + targetPos.x * normLimit, limit, rootPos.z * (1 - normLimit) + targetPos.z * normLimit);
    }

    applyLookTwist( rig, boneInfo, ik, look, twist ) {

        const bind = rig.tpose.bones[ boneInfo.idx ];
        const pose = rig.pose.bones[ boneInfo.idx ];

        let poseParentRot = pose.parent.getWorldQuaternion(new THREE.Quaternion());
        if(rig.pose.transformsWorldEmbedded) {
            poseParentRot.premultiply(rig.pose.transformsWorldEmbedded.forward.q)
        }

        let bindRot = bind.getWorldQuaternion(new THREE.Quaternion());
        if(rig.tpose.transformsWorldEmbedded) {
            bindRot.premultiply(rig.tpose.transformsWorldEmbedded.forward.q)
        }

        // Compute the bone rotation if it doesn't have any animated rotation
        const rotation = poseParentRot.clone().multiply(bind.quaternion);

        const invRot = bindRot.clone().invert();
        const altLookDir = look.clone().applyQuaternion(invRot);
        const altTwistDirection = twist.clone().applyQuaternion(invRot);
        
        //After the HIP was moved and the Limb IK is complete, this is where alternative Look Direction currently points to.
        const currentLook = altLookDir.clone().applyQuaternion(rotation).normalize();

        // Apply the final rotation to the bone to get it pointing at the right direction and twisted to match the original animation
        let swing = new THREE.Quaternion().setFromUnitVectors(currentLook, ik.look); // Compute swing rotation
        swing.multiply(rotation); // Apply swing to the bone rotation

        // Compute Twist Direction after swing rotation has been applied. Then use it to compute our twist rotation.
		const currentTwist = altTwistDirection.applyQuaternion(swing).normalize();
		const twistRot = new THREE.Quaternion().setFromUnitVectors( currentTwist, ik.twist );
		swing.premultiply( twistRot );	// Apply Twist

        swing.premultiply( poseParentRot.invert() ); // Convert to LS
		pose.quaternion.copy(swing );
    }

    applySpine( rig, chain, ik, look, twist) {

        const parent = rig.pose.bones[chain.bones[0].idx].parent;
        let poseParentPos = parent.getWorldPosition(new THREE.Vector3());
        let poseParentRot = parent.getWorldQuaternion(new THREE.Quaternion());
        if(rig.pose.transformsWorldEmbedded) {
            let mat = parent.matrix.clone();
            let cmat = new THREE.Matrix4().compose(rig.pose.transformsWorldEmbedded.forward.p, rig.pose.transformsWorldEmbedded.forward.q, rig.pose.transformsWorldEmbedded.forward.s);
            mat.premultiply(cmat);
            mat.decompose(poseParentPos, new THREE.Quaternion(), new THREE.Vector3());

            poseParentRot.premultiply(rig.pose.transformsWorldEmbedded.forward.q);
        }

        const count = chain.bones.length - 1;
        for(let i = 0; i < chain.bones.length; i++) {
            const boneInfo = chain.bones[i];
            const t = i / count * 2; // lerp time: 0 on first bone, 1 at final bone. Can be customized: increase interpolation curve, more stable it is

            const bind = rig.tpose.bones[ boneInfo.idx ];
            const pose = rig.pose.bones[ boneInfo.idx ];

            // Lerp target IK directions for this bone
            let newLook = ik[0].look.clone().lerp(ik[1].look, t);
            let newTwist = ik[0].twist.clone().lerp(ik[1].twist, t);

            // Compute directions, using defined look and twist directions
            let bindRot = bind.getWorldQuaternion(new THREE.Quaternion());
            if(rig.tpose.transformsWorldEmbedded) {
                bindRot.premultiply(rig.tpose.transformsWorldEmbedded.forward.q)
            }

            const invRot = bindRot.clone().invert();
            const altLookDir = look.clone().applyQuaternion(invRot);
            const altTwistDirection = twist.clone().applyQuaternion(invRot);

            // Compute the bone rotation if it doesn't have any animated rotation
            const rotation = poseParentRot.clone().multiply(bind.quaternion);

            const currentLook = altLookDir.clone().applyQuaternion(rotation).normalize();

            // Apply the final rotation to the bone to get it pointing at the right direction and twisted to match the original animation
            let swing = new THREE.Quaternion().setFromUnitVectors(currentLook, newLook); // Compute swing rotation
            swing.multiply(rotation); // Apply swing to the bone rotation

            // Compute Twist Direction after swing rotation has been applied. Then use it to compute our twist rotation.
            const currentTwist = altTwistDirection.applyQuaternion(swing).normalize();
            const twistRot = new THREE.Quaternion().setFromUnitVectors( currentTwist, newTwist );
            swing.premultiply( twistRot );	// Apply Twist

            const parentInv = poseParentRot.clone().invert();
            if(t != 1) {
                poseParentRot.copy(swing);
            }
            
            swing.premultiply(parentInv); // to LS
            pose.quaternion.copy(swing );
        }
    }
}

class IKCompute {

    static run(rig, ikPose) {
        this.rig = rig;
       
        this.hip(rig, ikPose);
        
        // Legs
        this.limb(rig.pose, rig.chains.leg_l, ikPose.leftLeg);
        this.limb(rig.pose, rig.chains.leg_r, ikPose.rightLeg);
      
        // Feet
        this.lookTwist( rig, rig.points.foot_l, ikPose.leftFoot, FORWARD, UP ); // Look = Forward, Twist = Up
        this.lookTwist( rig, rig.points.foot_r, ikPose.rightFoot, FORWARD, UP );

        this.spine(rig, rig.chains.spine, ikPose, UP, FORWARD); // Swing = Up, Twist = Forward : for stability of the upper body

        // Arms
        this.limb(rig.pose, rig.chains.thumb_r, ikPose.rightThumb);
        this.limb(rig.pose, rig.chains.index_r, ikPose.rightIndex);
        this.limb(rig.pose, rig.chains.middle_r, ikPose.rightMiddle);
        this.limb(rig.pose, rig.chains.ring_r, ikPose.rightRing);
        this.limb(rig.pose, rig.chains.pinky_r, ikPose.rightPinky);
        this.limb(rig.pose, rig.chains.arm_l, ikPose.leftArm);
        this.limb(rig.pose, rig.chains.arm_r, ikPose.rightArm);

        this.lookTwist( rig, rig.points.neck, ikPose.neck, FORWARD, UP ); // Look = Forward, Twist = Up
        this.lookTwist( rig, rig.points.head, ikPose.head, FORWARD, UP ); // Look = Forward, Twist = Up
    }

    static hip(rig, ikPose) {
        let info = rig.points.hip; //Rig Hip info
        let pose = rig.pose.bones[info.idx]; // Animated (current) pose bone
        let bind = rig.tpose.bones[info.idx]; // TPose bone

        let tpWolrdRotation = bind.getWorldQuaternion(new THREE.Quaternion());
        if(rig.tpose.transformsWorldEmbedded) {
            tpWolrdRotation.premultiply(rig.tpose.transformsWorldEmbedded.forward.q)
        }
        let qInv = tpWolrdRotation.clone().invert();

        // Transform/translate FORWARD and UP in the orientation of the Root bone
        const forward = FORWARD.clone();
        let alt_forward = forward.clone().applyQuaternion(qInv);

        let up = UP.clone();
        let alt_up = up.clone().applyQuaternion(qInv);

        let pWolrdRotation = pose.getWorldQuaternion(new THREE.Quaternion());
        if(rig.pose.transformsWorldEmbedded) {
            pWolrdRotation.premultiply(rig.pose.transformsWorldEmbedded.forward.q)
        }
        // Rotate them based on the animation
        let pose_forward = alt_forward.applyQuaternion(pWolrdRotation);
        let pose_up = alt_up.applyQuaternion(pWolrdRotation);
        
        // Calculate the Swing and Twist values to swing to our TPose into the animation direction
        let swing = new THREE.Quaternion().setFromUnitVectors(forward, pose_forward.normalize()); // Swing rotation from on direction to the other
        
        // swing.premultiply(qInv);
        // swing.multiply(pWolrdRotation);
        
        let swing_up = UP.clone().applyQuaternion(swing); // new UP direction based only swing
        let twist = swing_up.angleTo(pose_up); // swing + pose have same FORWARD, use angle between both UPs for twist
        swing.multiply(tpWolrdRotation);// apply swing rotation to the bone rotation of the bind pose (tpose). This will do a FORWARD swing

        if( twist <= EPSILON) {
            twist = 0;
        }
        else {
            let swing_left = new THREE.Vector3().crossVectors(swing_up.normalize(), pose_forward);
            if(swing_left.dot(pose_up.normalize()) >= 0) {
                twist = -twist;
            }
        }

        // Save all information
        let pos = pose.getWorldPosition(new THREE.Vector3());
        let tpos = bind.getWorldPosition(new THREE.Vector3());
        if(rig.tpose.transformsWorldEmbedded) {
            let mat = bind.matrixWorld.clone();
            let cmat = new THREE.Matrix4().compose(rig.tpose.transformsWorldEmbedded.forward.p, rig.tpose.transformsWorldEmbedded.forward.q, rig.tpose.transformsWorldEmbedded.forward.s);
            mat.premultiply(cmat);
            mat.decompose(tpos, new THREE.Quaternion(), new THREE.Vector3());
        }
        if(rig.pose.transformsWorldEmbedded) {
            let mat = pose.matrixWorld.clone();
            let cmat = new THREE.Matrix4().compose(rig.pose.transformsWorldEmbedded.forward.p, rig.pose.transformsWorldEmbedded.forward.q, rig.pose.transformsWorldEmbedded.forward.s);
            mat.premultiply(cmat);
            mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
        }

        ikPose.hip.bindHeight = tpos.y; // Bind pose height of the hip (helps scaling)
        ikPose.hip.movement.subVectors(pos, tpos); // How much movement did the hip between Bind and Animated
        ikPose.hip.direction.copy(pose_forward); // Direction we want the hip to point to
        ikPose.hip.twist = twist; // How much twisting to apply after pointing in the correct direction
        
        // let arrowHelper = new THREE.ArrowHelper( FORWARD, pos, 1, "red" );
        // arrowHelper.line.material.depthTest = false;
        // arrowHelper.line.computeLineDistances();   
        // arrowHelper.name = "line";
        // window.globals.app.scene.add(arrowHelper);

        // arrowHelper = new THREE.ArrowHelper( UP, pos, 1, "red" );
        // arrowHelper.line.material.depthTest = false;
        // arrowHelper.line.computeLineDistances();   
        // arrowHelper.name = "line";
        // window.globals.app.scene.add(arrowHelper);        

        // arrowHelper = new THREE.ArrowHelper( pose_forward, pos, 1, "pink" );
        // arrowHelper.line.material.depthTest = false;
        // arrowHelper.line.computeLineDistances();   
        // arrowHelper.name = "line";
        // window.globals.app.scene.add(arrowHelper);

        // arrowHelper = new THREE.ArrowHelper( pose_up, pos, 1, "pink" );
        // arrowHelper.line.material.depthTest = false;
        // arrowHelper.line.computeLineDistances();   
        // arrowHelper.name = "line";
        // window.globals.app.scene.add(arrowHelper);  
    }

    static limb(pose, chain, ikLimb) {
        const bones = chain.bones;
        const rootBone = pose.bones[bones[0].idx];  // first bone
        const endBone = pose.bones[bones[bones.length-1].idx]; // end bone
        
        const rootPos = rootBone.getWorldPosition(new THREE.Vector3());
        const rootRot = rootBone.getWorldQuaternion(new THREE.Quaternion());
        const endPos = endBone.getWorldPosition(new THREE.Vector3());         
        const endRot = endBone.getWorldQuaternion(new THREE.Quaternion()); 

        if(pose.transformsWorldEmbedded) {
            let mat = rootBone.matrixWorld.clone();
            let cmat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
            mat.premultiply(cmat);
            mat.decompose(rootPos, rootRot, new THREE.Vector3());

            mat = endBone.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(endPos, endRot, new THREE.Vector3());
        }        

        let direction = new THREE.Vector3().subVectors(endPos, rootPos); // direction from the first to the final bone (IK direction)
        let length = direction.length(); // distance from the first bone to the final bone

        ikLimb.lengthScale = length / chain.length; // Normalize the distance based on the length of the chain (ratio)
        ikLimb.direction.copy(direction.normalize());

        const jointDir = chain.alt_up.clone().applyQuaternion(rootRot).normalize(); //get direction of the joint rotating the UP vector
        const leftDir = new THREE.Vector3();
        leftDir.crossVectors(jointDir, direction); // compute LEFT vector tp realign UP
        ikLimb.jointDirection.crossVectors(direction, leftDir).normalize(); // recompute UP, make it orthogonal to LEFT and FORWARD       
    }

    static limb_three(tpose, pose, chain, ikLimb)  {

        const bones = chain.bones;

        const bindRootBone = tpose.bones[bones[0].idx];  // first bone
        const bindSecondBone = tpose.bones[bones[1].idx]; // second bone
        const bindEndBone = tpose.bones[bones[bones.length-1].idx]; // end bone
        
        const rootBone = pose.bones[bones[0].idx];  // first bone
        const secondBone = pose.bones[bones[1].idx]; // second bone
        const endBone = pose.bones[bones[bones.length-1].idx]; // end bone
    }

    static lookTwist(rig, boneInfo, ik, lookDirection, twistDirection) {
        const bind = rig.tpose.bones[boneInfo.idx]; // TPose bone
        const pose = rig.pose.bones[boneInfo.idx]; // Current Pose bone

        // Get WS rotation of bone in bind pose
        let bindRot = bind.getWorldQuaternion(new THREE.Quaternion());
        if(rig.tpose.transformsWorldEmbedded) {
            bindRot.premultiply(rig.tpose.transformsWorldEmbedded.forward.q);
        }

        // Get WS rotation of bone in current pose
        let poseRot = pose.getWorldQuaternion(new THREE.Quaternion());
        let posePos = pose.getWorldPosition(new THREE.Vector3());
        if(rig.pose.transformsWorldEmbedded) {
            poseRot.premultiply(rig.pose.transformsWorldEmbedded.forward.q);
            let cmat = new THREE.Matrix4().compose(rig.pose.transformsWorldEmbedded.forward.p, rig.pose.transformsWorldEmbedded.forward.q, rig.pose.transformsWorldEmbedded.forward.s);
            let mat = pose.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(posePos, new THREE.Quaternion(), new THREE.Vector3());
        }

        // Look dir = Forward (follow the bone), Twist dir = Up
        const invRot = bindRot.invert();
        const altLookDir = lookDirection.clone().applyQuaternion(invRot);
        const altTwistDirection = twistDirection.clone().applyQuaternion(invRot);

        const poseLookDirection = altLookDir.applyQuaternion(poseRot);
        const poseTwistDirection = altTwistDirection.applyQuaternion(poseRot);

        ik.toVisualize = {
            pos: pose.getWorldPosition(new THREE.Vector3()),
            lookDir:lookDirection,
            twist: twistDirection
        }
        ik.look.copy(poseLookDirection);
        ik.twist.copy(poseTwistDirection);
    }

    static spine(rig, chain, ikPose, look, twist) {
        for(let i = 0; i < chain.bones.length; i++) {
            const boneInfo = chain.bones[i];
            const bind = rig.tpose.bones[boneInfo.idx];
            const pose = rig.pose.bones[boneInfo.idx];

            // Create quat inverse direction
            let bindRot = bind.getWorldQuaternion(new THREE.Quaternion());
            if(rig.tpose.transformsWorldEmbedded) {
                bindRot.premultiply(rig.tpose.transformsWorldEmbedded.forward.q);
            }

            let poseRot = pose.getWorldQuaternion(new THREE.Quaternion());
            if(rig.pose.transformsWorldEmbedded) {
                poseRot.premultiply(rig.pose.transformsWorldEmbedded.forward.q);
            }
            
            const invRot = bindRot.clone().invert();

            const newLook = look.clone().applyQuaternion(invRot);
            const newTwist = twist.clone().applyQuaternion(invRot);

            newLook.applyQuaternion(poseRot);
            newTwist.applyQuaternion(poseRot);

            ikPose.spine[i].look = newLook;
            ikPose.spine[i].twist = newTwist;
        }
    }
}

class IKVisualize {
    static run(ikRig, ik, scene, name) {
        this.hip(ikRig, ik, scene, name);
        // this.limb(ikRig, ikRig.chains, "leg_l", ik.leftLeg, scene, name);
        // this.limb(ikRig, ikRig.chains, "leg_r", ik.rightLeg, scene, name);
        // this.limb(ikRig, ikRig.chains, "arm_l", ik.leftArm, scene, name);
        // this.limb(ikRig, ikRig.chains, "arm_r", ik.rightArm, scene, name);
        this.limb(ikRig, ikRig.chains, "thumb_r", ik.rightThumb, scene, name);
        this.limb(ikRig, ikRig.chains, "index_r", ik.rightIndex, scene, name);
        this.limb(ikRig, ikRig.chains, "middle_r", ik.rightMiddle, scene, name);
        this.limb(ikRig, ikRig.chains, "ring_r", ik.rightRing, scene, name);
        this.limb(ikRig, ikRig.chains, "pinky_r", ik.rightPinky, scene, name);
        // this.foot(ikRig, ikRig.points.foot_l, "foot_l", ik.leftFoot, scene, name);
        // this.foot(ikRig, ikRig.points.foot_r, "foot_r", ik.rightFoot, scene, name);
    }

    static hip(ikRig, ik, scene, name) {
        
        let sphere = scene.getObjectByName("hipSphere_" + name);
        if(!sphere) {
            const geometry = new THREE.SphereGeometry( 0.005, 10, 10 ); 
            const material = new THREE.MeshBasicMaterial( { color: "orange", depthTest: false } ); 
            sphere = new THREE.Mesh( geometry, material ); 
            sphere.name = "hipSphere_" + name;
            scene.add(sphere);
        }

        ikRig.pose.bones[ikRig.points.hip.idx].getWorldPosition(sphere.position);

        let arrowHelper = scene.getObjectByName("hipLine_"+name);
        if(!arrowHelper) {
            arrowHelper = new THREE.ArrowHelper( ik.hip.direction, sphere.position, 0.2, "cyan" );
            arrowHelper.line.material = new THREE.LineDashedMaterial({color: "cyan", scale: 1, dashSize: 0.1, gapSize: 0.1})
            arrowHelper.line.computeLineDistances();   
            arrowHelper.name = "hipLine_"+name;
            scene.add(arrowHelper);
        }
        else {
            arrowHelper.setDirection(ik.hip.direction);
            arrowHelper.position.copy(sphere.position);
        }
    }

    static limb(ikRig, chains, chainName, ik, scene, name) {
        const len = chains[chainName].length * ik.lengthScale;

        let firstSphere = scene.getObjectByName("limbFirstSphere_" + chainName + "_" + name);
        if(!firstSphere) {
            const geometry = new THREE.SphereGeometry( 0.005, 10, 10 ); 
            const material = new THREE.MeshBasicMaterial( { color: "yellow", depthTest: false} ); 
            firstSphere = new THREE.Mesh( geometry, material ); 
            firstSphere.name = "limbFirstSphere_" + chainName + "_" + name;
            scene.add(firstSphere);
        }

        let lastSphere = scene.getObjectByName("limbLastSphere_" + chainName + "_" + name);
        if(!lastSphere) {
            const geometry = new THREE.SphereGeometry( 0.005, 10, 10 ); 
            const material = new THREE.MeshBasicMaterial( { color: "orange", depthTest: false } ); 
            lastSphere = new THREE.Mesh( geometry, material ); 
            lastSphere.name = "limbLastSphere_" + chainName + "_" + name;
            scene.add(lastSphere);
        }

        const bones = chains[chainName].bones;
        ikRig.pose.bones[bones[0].idx].getWorldPosition(firstSphere.position); //First bone
       
        let lastPos = ik.direction.clone();
        lastPos.multiplyScalar(len).add(firstSphere.position);
        lastSphere.position.copy(lastPos);
        // ikRig.pose.bones[bones[bones.length-1].idx].getWorldPosition(lastSphere.position); //End bone

        let directionArrow = scene.getObjectByName("limbDirectionLine_" + chainName + "_" + name);
        if(!directionArrow) {
            directionArrow = new THREE.ArrowHelper( ik.direction, firstSphere.position, len, "yellow", 0.01 );
            directionArrow.line.material = new THREE.LineDashedMaterial({color: "yellow", scale: 1, dashSize: 0.05, gapSize: 0.05, depthTest:false})
            directionArrow.line.computeLineDistances();   
            directionArrow.name = "limbDirectionLine_" + chainName + "_" + name;
            scene.add(directionArrow);
        }
        else {
            directionArrow.setDirection(ik.direction);
            directionArrow.position.copy(firstSphere.position);
        }

        let arrowHelper = scene.getObjectByName("limbLine_" + chainName + "_" + name);
        if(!arrowHelper) {
            arrowHelper = new THREE.ArrowHelper( ik.jointDirection, firstSphere.position, 0.2, "cyan" );
            arrowHelper.line.material = new THREE.LineDashedMaterial({color: "cyan", scale: 1, dashSize: 0.1, gapSize: 0.1})
            arrowHelper.line.computeLineDistances();   
            arrowHelper.name = "limbLine_" + chainName + "_" + name;
            scene.add(arrowHelper);
        }
        else {
            arrowHelper.setDirection(ik.jointDirection);
            arrowHelper.position.copy(firstSphere.position);
        }
       
        let target = scene.getObjectByName("targetSphere_" + chainName + "_" + name);
        if(!target) {
            const geometry = new THREE.SphereGeometry( 0.005, 10, 10 ); 
            const material = new THREE.MeshBasicMaterial( { color: "red", depthTest: false } ); 
            target = new THREE.Mesh( geometry, material ); 
            target.name = "targetSphere_" + chainName + "_" + name;
            scene.add(target);
        }
        target.position.copy(chains[chainName].target.position);
        // if(name == 'vegeta') {
            // target.position.x+=0.5+ikRig.pose.bones[0].position.x;
        //   target.position.z+= ikRig.pose.bones[0].position.z;
        // }
        // let arrow = new THREE.ArrowHelper( ik.toVisualize.jointDir, ik.toVisualize.pos, len, "white", 0.01 );
        // scene.add(arrow);
        // arrow = new THREE.ArrowHelper( ik.toVisualize.leftDir, ik.toVisualize.pos, len, "orange", 0.01 );
        // scene.add(arrow);
        // arrow = new THREE.ArrowHelper( ik.toVisualize.chainDir, ik.toVisualize.pos, len, "yellow", 0.01 );
        // scene.add(arrow);
        // arrow = new THREE.ArrowHelper( ik.toVisualize.newJointDir, ik.toVisualize.pos, len, "red", 0.01 );
        // scene.add(arrow);
    }

    static foot(ikRig, boneInfo, chainName, ik, scene, name) {

        let sphere = scene.getObjectByName("sphere_" + chainName + "_" + name);
        if(!sphere) {
            const geometry = new THREE.SphereGeometry( 0.02, 10, 10 ); 
            const material = new THREE.MeshBasicMaterial( { color: "cyan", depthTest: false} ); 
            sphere = new THREE.Mesh( geometry, material ); 
            sphere.name = "sphere_" + chainName + "_" + name;
            scene.add(sphere);
        }

        ikRig.pose.bones[boneInfo.idx].getWorldPosition(sphere.position);

        let arrowHelper = scene.getObjectByName("look" + chainName + "_" + name);
        if(!arrowHelper) {
            arrowHelper = new THREE.ArrowHelper( ik.look, sphere.position, 0.2, "blue" );
            arrowHelper.line.material = new THREE.LineDashedMaterial({color: "blue", scale: 1, dashSize: 0.1, gapSize: 0.1, depthTest:false})
            arrowHelper.line.computeLineDistances();   
            arrowHelper.name = "look" + chainName + "_" + name;
            scene.add(arrowHelper);
        }
        else {
            arrowHelper.setDirection(ik.look);
            arrowHelper.position.copy(sphere.position);
        }

        arrowHelper = scene.getObjectByName("twist" + chainName + "_" + name);
        if(!arrowHelper) {
            arrowHelper = new THREE.ArrowHelper( ik.twist, sphere.position, 0.2, "cyan" );
            arrowHelper.line.material = new THREE.LineDashedMaterial({color: "cyan", scale: 1, dashSize: 0.1, gapSize: 0.1, depthTest:false})
            arrowHelper.line.computeLineDistances();   
            arrowHelper.name = "twist" + chainName + "_" + name;
            scene.add(arrowHelper);
        }
        else {
            arrowHelper.setDirection(ik.twist);
            arrowHelper.position.copy(sphere.position);
        }

        if(!ik.toVisualize)
            return;

        // const len = 1;
        // let arrow = new THREE.ArrowHelper( ik.toVisualize.lookDir, ik.toVisualize.pos, len, "white", 0.01 );
        // scene.add(arrow);

        // arrow = new THREE.ArrowHelper( ik.toVisualize.twistDir, ik.toVisualize.pos, len, "white", 0.01 );
        // scene.add(arrow);

        // arrow = new THREE.ArrowHelper( ik.look, ik.toVisualize.pos, len, "orange", 0.01 );
        // scene.add(arrow);

        // arrow = new THREE.ArrowHelper( ik.twist, ik.toVisualize.pos, len, "orange", 0.01 );
        // scene.add(arrow);
    }
}

class IKSolver {
    constructor(skeleton, chain, multi = false) {
        this.skeleton = skeleton;
        this.chain = chain;
        this.target = chain.target;
        this.forward = new THREE.Vector3(0,0,1);
        this.left = new THREE.Vector3(1,0,0);
        this.up = new THREE.Vector3(0,1,0);
        this.multi = multi;
    }

    solve(pose, forward, up) {
        if(!this.multi) {
            this.limbSolver(pose, forward, up);
        }
        else {
            this.multiSolver(pose, forward, up);
        }       
    }
    
    limbSolver(pose, forward, up) {
        this.forward = forward.normalize();
        this.left = new THREE.Vector3().crossVectors(up, this.forward).normalize();
        this.up = new THREE.Vector3().crossVectors(this.forward, this.left).normalize();

        const chain = this.chain;
        const bindFirst = this.skeleton.bones[chain.bones[0].idx]; // Bone reference from Bind pose
        const bindSecond = this.skeleton.bones[chain.bones[1].idx]; 
        let poseFirst = pose.bones[chain.bones[0].idx]; // Bone reference from Current pose
        let poseSecond = pose.bones[chain.bones[1].idx]; 

        const bindFirstLen = chain.bones[0].len;
        const bindSecondLen = chain.bones[1].len;

        let rotation = new THREE.Quaternion();

        // FIRST BONE - Aim then rotate by the angle.
        // Aim the first bone towards the target oriented with the bend direction.

        // Get WS rotation of First bone
        let bindFirstRot = bindFirst.getWorldQuaternion(new THREE.Quaternion());

        if(this.skeleton.transformsWorldEmbedded) {
            bindFirstRot.premultiply(this.skeleton.transformsWorldEmbedded.forward.q)
        }

        // Get Bone's WS forward direction
        let direction = chain.alt_forward.clone();
        direction.applyQuaternion(bindFirstRot).normalize();

        // Swing
        let swing = new THREE.Quaternion().setFromUnitVectors(direction, this.forward); // Create swing rotation
        rotation.multiplyQuaternions(swing, bindFirstRot);

        // Twist
        // direction.setFromAxisAngle(chain.alt_up, rotation); // After swing, compute UP direction
        direction = chain.alt_up.clone().applyQuaternion(swing).normalize(); // new UP direction based only swing
        let twist = direction.angleTo(this.up); // Get difference between Swing UP and Target UP
       
        if(twist <= EPSILON) {
            twist = 0;
        }
        else {
            direction.crossVectors(direction, this.forward);
            if(direction.clone().dot(this.up) >= 0) {
                twist = -twist;
            }
        }

        rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(this.forward, twist));
        
        //------------
        let parentPoseRot = bindFirst.parent.getWorldQuaternion(new THREE.Quaternion());
        let poseFirstPos = bindFirst.getWorldPosition(new THREE.Vector3());

        if(this.skeleton.transformsWorldEmbedded) {
            parentPoseRot.premultiply(this.skeleton.transformsWorldEmbedded.forward.q)
            let cmat = new THREE.Matrix4().compose(this.skeleton.transformsWorldEmbedded.forward.p, this.skeleton.transformsWorldEmbedded.forward.q, this.skeleton.transformsWorldEmbedded.forward.s);
            let mat = bindFirst.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(poseFirstPos, new THREE.Quaternion(), new THREE.Vector3());
        }

           
        // let arrowHelper = window.globals.app.scene.getObjectByName("forward" );
        // if(!arrowHelper) {
        //     arrowHelper = new THREE.ArrowHelper(this.forward, poseFirstPos, 0.2, "blue" );
        //     arrowHelper.line.material = new THREE.LineDashedMaterial({color: "blue", scale: 1, dashSize: 0.1, gapSize: 0.1})
        //     arrowHelper.line.computeLineDistances();   
        //     arrowHelper.name = "forward_";
        //     window.globals.app.scene.add(arrowHelper);
        // }
       
        // arrowHelper = window.globals.app.scene.getObjectByName("up" );
        // if(!arrowHelper) {
        //     arrowHelper = new THREE.ArrowHelper(this.up, poseFirstPos, 0.2, "green" );
        //     arrowHelper.line.material = new THREE.LineDashedMaterial({color: "green", scale: 1, dashSize: 0.1, gapSize: 0.1})
        //     arrowHelper.line.computeLineDistances();   
        //     arrowHelper.name = "up_";
        //     window.globals.app.scene.add(arrowHelper);
        // }

        // arrowHelper = window.globals.app.scene.getObjectByName("left" );
        // if(!arrowHelper) {
        //     arrowHelper = new THREE.ArrowHelper(this.left, poseFirstPos, 0.2, "red" );
        //     arrowHelper.line.material = new THREE.LineDashedMaterial({color: "red", scale: 1, dashSize: 0.1, gapSize: 0.1})
        //     arrowHelper.line.computeLineDistances();   
        //     arrowHelper.name = "left_";
        //     window.globals.app.scene.add(arrowHelper);
        // }
        const chainLen = new THREE.Vector3().subVectors(chain.target.position, poseFirstPos).length();

        // Get the angle between the first bone and the target (last bone)
        let angle = lawCosSSS(bindFirstLen, chainLen, bindSecondLen);

        // Use the target's X axis for rotation along with the angle from SSS
        rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(this.left, -angle));
        let rotationLS = rotation.clone();
       
        rotationLS.premultiply(parentPoseRot.invert()); // Convert to bone's LS by multiplying the inverse rotation of the parent

        poseFirst.quaternion.copy(rotationLS);
        poseFirst.updateWorldMatrix(true, true);
        
        //-----------------------------------------------------------
        // SECOND BONE - Rotate in the other direction
        angle = Math.PI - lawCosSSS(bindFirstLen, bindSecondLen, chainLen);
        const invRot = rotation.clone().invert();
        rotation.multiplyQuaternions(rotation, bindSecond.quaternion); // Convert LS second bind bone rotation in the WS of the first current pose bone 
        rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(this.left, angle)); // Rotate it by the target's X axis
        rotation.premultiply(invRot); // Convert to bone's LS

        poseSecond.quaternion.copy(rotation);
        // poseSecond.quaternion.set(0,0.707, 0.707, 0)
        poseSecond.updateWorldMatrix(true, true);
    }

    multiSolver(pose, forward, up) {
        this.forward = forward.normalize();
        this.left = new THREE.Vector3().crossVectors(up, this.forward).normalize();
        this.up = new THREE.Vector3().crossVectors(this.forward, this.left).normalize();

        const chain = this.chain;
        const bindFirst = this.skeleton.bones[chain.bones[0].idx]; // Bone reference from Bind pose
        const bindSecond = this.skeleton.bones[chain.bones[1].idx]; 
        const bindEnd = this.skeleton.bones[chain.bones[2].idx]; 

        let poseFirst = pose.bones[chain.bones[0].idx]; // Bone reference from Current pose
        let poseSecond = pose.bones[chain.bones[1].idx]; 
        let poseEnd = pose.bones[chain.bones[2].idx]; 

        const bindFirstLen = chain.bones[0].len;
        const bindSecondLen = chain.bones[1].len;
        const bindEndLen = chain.bones[2].len;
        
        let parentPoseRot = bindFirst.parent.getWorldQuaternion(new THREE.Quaternion());
        let poseFirstPos = bindFirst.getWorldPosition(new THREE.Vector3());
        let poseSecondPos = bindSecond.getWorldPosition(new THREE.Vector3());
        let poseEndPos = bindEnd.getWorldPosition(new THREE.Vector3());

        if(this.skeleton.transformsWorldEmbedded) {
            parentPoseRot.premultiply(this.skeleton.transformsWorldEmbedded.forward.q)
            let cmat = new THREE.Matrix4().compose(this.skeleton.transformsWorldEmbedded.forward.p, this.skeleton.transformsWorldEmbedded.forward.q, this.skeleton.transformsWorldEmbedded.forward.s);
            let mat = bindFirst.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(poseFirstPos, new THREE.Quaternion(), new THREE.Vector3());
            mat = bindSecond.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(poseEndPos, new THREE.Quaternion(), new THREE.Vector3());
            mat = bindEnd.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(poseEndPos, new THREE.Quaternion(), new THREE.Vector3());
        }

        const chainLen = new THREE.Vector3().subVectors(chain.target.position, poseFirstPos).length();
        const bindFirstEndLen = new THREE.Vector3().subVectors(poseEndPos, poseFirstPos).length();


        const t = (bindFirstLen + bindSecondLen*0.5) / (bindFirstLen + bindSecondLen + bindEndLen); // how much to subduvude the target length
        const tBindFirstLen = chainLen * t; // A to B
        const tBindSecondLen = chainLen - tBindFirstLen; // B to C

        let rotation = new THREE.Quaternion();

        // FIRST BONE - Aim then rotate by the angle.
        // Aim the first bone towards the target oriented with the bend direction.

        // Get WS rotation of First bone
        let bindFirstRot = bindFirst.getWorldQuaternion(new THREE.Quaternion());

        if(this.skeleton.transformsWorldEmbedded) {
            bindFirstRot.premultiply(this.skeleton.transformsWorldEmbedded.forward.q)
        }

        // Get Bone's WS forward direction
        let direction = chain.alt_forward.clone();
        direction.applyQuaternion(bindFirstRot).normalize();

        // Swing
        let swing = new THREE.Quaternion().setFromUnitVectors(direction, this.forward); // Create swing rotation
        rotation.multiplyQuaternions(swing, bindFirstRot);

        // Twist
        // direction.setFromAxisAngle(chain.alt_up, rotation); // After swing, compute UP direction
        direction = chain.alt_up.clone().applyQuaternion(rotation).normalize(); // new UP direction based only swing
        let twist = direction.angleTo(this.up); // Get difference between Swing UP and Target UP
        
        if(twist <= EPSILON) {
            twist = 0;
        }
        else {
            direction.crossVectors(direction, this.forward);
            if(direction.clone().dot(this.up) >= 0) {
                twist = -twist;
            }
        }
        rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(this.forward, twist));
        
        //------------
        // Get the angle between the first bone and the target (last bone)
        let firstAngle = lawCosSSS(bindFirstLen, bindFirstEndLen, bindSecondLen);
        let angle =  lawCosSSS(bindFirstLen, chainLen, bindSecondLen );
        // Use the target's X axis for rotation along with the angle from SSS
        rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(this.left, -angle));
        let rotationLS = rotation.clone();
        let firstRot = rotation.clone();
        rotationLS.premultiply(parentPoseRot.invert()); // Convert to bone's LS by multiplying the inverse rotation of the parent

        poseFirst.quaternion.copy(rotationLS);
        poseFirst.updateWorldMatrix(true, true);

        // // SECOND BONE
        // let len = new THREE.Vector3().subVectors(chain.target.position, poseEndPos).length();
        // angle = Math.PI - lawCosSSS(bindFirstLen, bindSecondLen, chainLen);
        // let invRot = rotation.clone().invert();
        // rotation.multiplyQuaternions(rotation, bindSecond.quaternion); // Convert LS second bind bone rotation in the WS of the first current pose bone 
        // rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(this.left, angle)); // Rotate it by the target's X axis
        
        // rotationLS = rotation.clone();
        // rotationLS.premultiply(invRot); // Convert to bone's LS

        // poseSecond.quaternion.copy(rotationLS);
        // poseSecond.updateWorldMatrix(true, true);

        // // THIRD BONE
        // len = new THREE.Vector3().subVectors(chain.target.position, poseSecondPos).length();
        // angle = lawCosSSS(bindSecondLen, len, bindEndLen);
        // // Use the target's X axis for rotation along with the angle from SSS
        // invRot = firstRot.clone().invert();
        // rotation.multiplyQuaternions(firstRot, poseSecond.quaternion); // Convert LS second bind bone rotation in the WS of the first current pose bone 
        // rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(this.left, -angle)); // Rotate it by the target's X axis

        // rotationLS = rotation.clone();
        // rotationLS.premultiply(invRot); // Convert to bone's LS
        // poseSecond.quaternion.copy(rotationLS);
        // poseSecond.updateWorldMatrix(true, true);

        // angle = Math.PI - lawCosSSS(bindSecondLen, bindEndLen, len);
        // invRot = rotation.clone().invert();
        // rotation.multiplyQuaternions(rotation, bindEnd.quaternion); // Convert LS second bind bone rotation in the WS of the first current pose bone 
        // rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(this.left, -angle)); // Rotate it by the target's X axis
        
        // rotationLS = rotation.clone();
        // rotationLS.premultiply(invRot); // Convert to bone's LS

        // poseEnd.quaternion.copy(rotationLS);
        // // poseEnd.updateWorldMatrix(true, true);
    }
}

THREE.SkeletonHelper.prototype.changeColor = function ( a, b ) {

    //Change skeleton helper lines colors
    let colorArray = this.geometry.attributes.color.array;
    for(let i = 0; i < colorArray.length; i+=6) { 
        colorArray[i+3] = 58/256; 
        colorArray[i+4] = 161/256; 
        colorArray[i+5] = 156/256;
    }
    this.geometry.attributes.color.array = colorArray;
    this.material.linewidth = 5;
}

// Law of cosines SSS: To find an angle of a triangle when all rhree length sides are known (https://mathsisfun.com/algebra/trig-cosine-law.html)
function lawCosSSS(a,b,c) {
    let v = (Math.pow(a,2) + Math.pow(b,2) - Math.pow(c,2)) / (2*a*b);
    if(v > 1) {
        v = 1;
    }
    else if ( v < -1) {
        v = -1;
    }
    return Math.acos(v);
}