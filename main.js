import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FABRIKSolver, CCDIKSolver } from './IKSolver.js'

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

let CURRENT = 1;

class App {
    constructor() {
        this.elapsedTime = 0; // clock is ok but might need more time control to dinamicaly change signing speed
        this.clock = new THREE.Clock();
        this.loaderGLB = new GLTFLoader();
        this.loadedCharacters = {};
        this.sourceName = "Walking";
        this.targetName = "vegeta";
    }

    init() {
        this.initScene();

        this.loadAvatar("./data/" + this.sourceName + ".gltf", this.sourceName, () => {

            // this.initRig(this.sourceName, true);
            const source = this.loadedCharacters[this.sourceName];
            let rig = new IKRig();
            rig.init(source.skeleton, true);
            source.IKPose = new IKPose();
            source.IKrig = rig;
            IKCompute.run(rig, source.IKPose);
            // IKVisualize.run(rig, source.IKPose, this.scene, this.sourceName);

            this.loadAvatar("./data/" +this.targetName + ".gltf", this.targetName, () => {
                this.loadedCharacters[this.targetName].model.position.x = 1;

                const current = this.loadedCharacters[this.targetName];
                let rig = new IKRig();
                rig.init(current.skeleton, false, this.targetName == "robo_trex" ? 0 : 1);
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
                // IKCompute.run(rig, current.IKPose);

                current.IKrig = rig;

                source.IKPose.applyRig(rig, current.IKPose);
                if(rig.ikSolver) {
                    rig.ikSolver.update();
                }
                // IKVisualize.run(rig, current.IKPose, this.scene, this.targetName);
                this.animate();
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

    loadAvatar( filePath, avatarName, callback = null, onerror = null ) {
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
            
            if(glb.animations.length) {
                this.mixer = new THREE.AnimationMixer(skeleton.bones[0]);
                this.mixer.clipAction(glb.animations[0]).setEffectiveWeight(1.0).play();
                this.mixer.update(0.01);
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
        if(this.mixer) {
            this.mixer.update(dt*0.5);
            IKCompute.run(this.loadedCharacters[this.sourceName].IKrig, this.loadedCharacters[this.sourceName].IKPose);
            IKVisualize.run(this.loadedCharacters[this.sourceName].IKrig, this.loadedCharacters[this.sourceName].IKPose, this.scene, this.sourceName);
            this.loadedCharacters[this.sourceName].IKPose.applyRig(this.loadedCharacters[this.targetName].IKrig);
           
            if(this.loadedCharacters[this.targetName].IKrig.ikSolver) {
                this.loadedCharacters[this.targetName].IKrig.ikSolver.update();
            }
            IKVisualize.run(this.loadedCharacters[this.targetName].IKrig, this.loadedCharacters[this.targetName].IKPose, this.scene, this.targetName);

        }
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

    init(skeleton, useNodeOffset = false, type = IKRig.ARM_MIXAMO) {
        this.skeleton = skeleton;        
        this.tpose = this.cloneRawSkeleton( skeleton, null, useNodeOffset );
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

    addChain(name, arrayNames, endEffectorName = null, constraints = [], ikSolver = null) {

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
            this.chains[ name ].ikSolver = new IKSolver(this.tpose, this.chains[ name ]);
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
        rig.addChain( "arm_l", [ "LeftArm", "LeftForeArm" ], "LeftHand", [{type: FABRIKSolver.JOINTTYPES.BALLSOCKET, min:-Math.PI*0.25, max:Math.PI*0.25, axis: [0,0,1], polar:[0, 0*Math.PI/180], azimuth: [0, 359*Math.PI/180]}, {type: FABRIKSolver.JOINTTYPES.HINGE, twist:[ 0, 0.0006 ], axis:[1,0,0], min: Math.PI, max: 324*Math.PI/180}]   ) //"x",
    
        rig.addChain( "leg_r", [ "RightUpLeg", "RightLeg" ], "RightFoot", [{type: FABRIKSolver.JOINTTYPES.BALLSOCKET, min:-Math.PI*0.25, max:Math.PI*0.25, axis: [0,0,1], polar:[0, 81*Math.PI/180], azimuth: [0, Math.PI*0.5]}, {type: FABRIKSolver.JOINTTYPES.HINGE, twist:[ 0, 0.0006 ], axis:[1,0,0], min: Math.PI, max: 324*Math.PI/180}]  ) //"z", 
        rig.addChain( "leg_l", [ "LeftUpLeg", "LeftLeg" ], "LeftFoot", [{type: FABRIKSolver.JOINTTYPES.BALLSOCKET, min:-Math.PI*0.25, max:Math.PI*0.25, axis: [0,0,1], polar:[0, 81*Math.PI/180], azimuth: [0, Math.PI*0.5]}, {type: FABRIKSolver.JOINTTYPES.HINGE, twist:[ 0, 0.0006 ], axis:[1,0,0], min: Math.PI, max: 324*Math.PI/180}] )  //"z", 
    
        // rig.addChain( "spine", [ "Spine", "Spine1", "Spine2" ] ) //, "y"
        
    
        // Set Direction of Joints on th Limbs   
        rig.setAlternatives( "leg_l", DOWN, FORWARD, rig.tpose );
        rig.setAlternatives( "leg_r", DOWN, FORWARD, rig.tpose );
        rig.setAlternatives( "arm_r", RIGHT, BACK, rig.tpose );
        rig.setAlternatives( "arm_l", LEFT, BACK, rig.tpose );
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
    }

    applyRig( rig, pose ) {
        this.applyHip(rig);
        this.applyLimb(rig, rig.chains.leg_l, this.leftLeg);
        this.applyLimb(rig, rig.chains.leg_r, this.rightLeg);
        this.applyLimb(rig, rig.chains.arm_l, this.leftArm);
        this.applyLimb(rig, rig.chains.arm_r, this.rightArm);
    }

    applyHip(rig) {
 
        const boneInfo = rig.points.hip;
        const bind = rig.tpose.bones[boneInfo.idx]; // Hips in bind pose
        const pose = rig.pose.bones[boneInfo.idx]; // Hips in current pose

        // ROTATION
        // Apply IK swing and twist
        let pWorldRotation = pose.getWorldQuaternion(new THREE.Quaternion());
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
            let mat = bind.matrix.clone();
            let cmat = new THREE.Matrix4().compose(rig.tpose.transformsWorldEmbedded.forward.p, rig.tpose.transformsWorldEmbedded.forward.q, rig.tpose.transformsWorldEmbedded.forward.s);
            mat.premultiply(cmat);
            mat.decompose(bWorldPosition, new THREE.Quaternion(), new THREE.Vector3());
        }
        const hipScale = bWorldPosition.y/this.hip.bindHeight; // Scale value from source's hip height and target's hip height
        let pos = new THREE.Vector3().copy(this.hip.movement).multiplyScalar(hipScale); // Scale the translation difference to mathc this model's scale
        pos.add(bWorldPosition); // Add that scaled different to the bind pose position

        pose.position.copy(pos);
    }

    applyLimb(rig, chain, limb) {
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
        // chain.target.position.copy(rootWorldPos).add(limb.direction)
        if(!rig.ikSolver) {
            chain.ikSolver.solve(rig.pose, limb.direction, limb.jointDirection);
        }
    }
}

class IKCompute {

    static run(rig, ikPose) {
        this.rig = rig;
        // rig.pose.updateWorld(); // Compute WS transforms for all the bones
       
        this.hip(rig, ikPose);
        this.limb(rig.pose, rig.chains.leg_l, ikPose.leftLeg);
        this.limb(rig.pose, rig.chains.leg_r, ikPose.rightLeg);
        this.limb(rig.pose, rig.chains.arm_l, ikPose.leftArm);
        this.limb(rig.pose, rig.chains.arm_r, ikPose.rightArm);
    }

    static hip(rig, ikPose) {
        let info = rig.points.hip; //Rig Hip info
        let pose = rig.pose.bones[info.idx]; // Animated (current) pose bone
        let bind = rig.tpose.bones[info.idx]; // TPose bone

        let tpWolrdRotation = bind.getWorldQuaternion(new THREE.Quaternion());
        if(rig.tpose.transformsWorldEmbedded) {
            tpWolrdRotation.premultiply(rig.tpose.transformsWorldEmbedded.forward.q)
        }
        let qInv = tpWolrdRotation.invert();

        // Transform/translate FORWARD and UP in the orientation of the Root bone
        const forward = new THREE.Vector3(0,0,1);
        let alt_forward = forward.clone();
        alt_forward.applyQuaternion(qInv);

        const up = new THREE.Vector3(0,1,0);
        let alt_up = up.clone()
        alt_up.applyQuaternion(qInv);

        let pWolrdRotation = pose.getWorldQuaternion(new THREE.Quaternion());
        // Rotate them based on the animation
        let pose_forward = alt_forward.applyQuaternion(pWolrdRotation);
        let pose_up = alt_up.applyQuaternion(pWolrdRotation);

        // Calculate the Swing and Twist values to swing to our TPose into the animation direction
        let swing = new THREE.Quaternion().setFromUnitVectors(forward, pose_forward.normalize()); // Swing rotation from on direction to the other
        swing.multiply(tpWolrdRotation); // apply swing rotation to the bone rotation of the bind pose (tpose). This will do a FORRWARD swing

        let swing_up = new THREE.Vector3().copy(up).applyQuaternion(swing); // new UP direction based only swing
        let twist = swing_up.angleTo(pose_up); // swing + pose have same FORWARD, use angle between both UPs for twist

        if(twist <= 0.01*Math.PI/180) {
            twist = 0;
        }
        else {
            let swing_left = new THREE.Vector3().crossVectors(swing_up.normalize(), pose_forward);
            if(swing_left.dot(pose_up) >= 0) {
                twist = -twist;
            }
        }

        // Save all information
        let pos = pose.getWorldPosition(new THREE.Vector3());
        let tpos = bind.getWorldPosition(new THREE.Vector3());
        if(rig.tpose.transformsWorldEmbedded) {
            let mat = bind.matrix.clone();
            let cmat = new THREE.Matrix4().compose(rig.tpose.transformsWorldEmbedded.forward.p, rig.tpose.transformsWorldEmbedded.forward.q, rig.tpose.transformsWorldEmbedded.forward.s);
            mat.premultiply(cmat);
            mat.decompose(tpos, new THREE.Quaternion(), new THREE.Vector3());
        }
        ikPose.hip.bindHeight = tpos.y; // Bind pose height of the hip (helps scaling)
        ikPose.hip.movement.subVectors(pos, tpos); // How much movement did the hip between Bind and Animated
        ikPose.hip.direction.copy(pose_forward); // Direction we want the hip to point to
        ikPose.hip.twist = twist; // How much twisting to apply after pointing in the correct direction
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
            let mat = rootBone.matrix.clone();
            let cmat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
            mat.premultiply(cmat);
            mat.decompose(rootPos, rootRot, new THREE.Vector3());

            mat = endBone.matrix.clone();
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

        ikLimb.toVisualize = {};
        ikLimb.toVisualize.pos = rootPos;
        ikLimb.toVisualize.jointDir = (jointDir);
        ikLimb.toVisualize.leftDir = (leftDir);        
        ikLimb.toVisualize.chainDir = (direction);        
        ikLimb.toVisualize.newJointDir = (ikLimb.jointDirection);        
    }
}

class IKVisualize {
    static run(ikRig, ik, scene, name) {
        this.hip(ikRig, ik, scene, name);
        this.limb(ikRig, ikRig.chains, "leg_l", ik.leftLeg, scene, name);
        this.limb(ikRig, ikRig.chains, "leg_r", ik.rightLeg, scene, name);
        this.limb(ikRig, ikRig.chains, "arm_l", ik.leftArm, scene, name);
        this.limb(ikRig, ikRig.chains, "arm_r", ik.rightArm, scene, name);
    }

    static hip(ikRig, ik, scene, name) {
        
        let sphere = scene.getObjectByName("hipSphere_" + name);
        if(!sphere) {
            const geometry = new THREE.SphereGeometry( 0.03, 10, 10 ); 
            const material = new THREE.MeshBasicMaterial( { color: "orange" } ); 
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
            const geometry = new THREE.SphereGeometry( 0.03, 10, 10 ); 
            const material = new THREE.MeshBasicMaterial( { color: "yellow", depthTest: false} ); 
            firstSphere = new THREE.Mesh( geometry, material ); 
            firstSphere.name = "limbFirstSphere_" + chainName + "_" + name;
            scene.add(firstSphere);
        }

        let lastSphere = scene.getObjectByName("limbLastSphere_" + chainName + "_" + name);
        if(!lastSphere) {
            const geometry = new THREE.SphereGeometry( 0.03, 10, 10 ); 
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
            directionArrow.line.material = new THREE.LineDashedMaterial({color: "yellow", scale: 1, dashSize: 0.05, gapSize: 0.05})
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
            const geometry = new THREE.SphereGeometry( 0.03, 10, 10 ); 
            const material = new THREE.MeshBasicMaterial( { color: "red", depthTest: false } ); 
            target = new THREE.Mesh( geometry, material ); 
            target.name = "targetSphere_" + chainName + "_" + name;
            scene.add(target);
        }
        target.position.copy(chains[chainName].target.position);

        // let arrow = new THREE.ArrowHelper( ik.toVisualize.jointDir, ik.toVisualize.pos, len, "white", 0.01 );
        // scene.add(arrow);
        // arrow = new THREE.ArrowHelper( ik.toVisualize.leftDir, ik.toVisualize.pos, len, "orange", 0.01 );
        // scene.add(arrow);
        // arrow = new THREE.ArrowHelper( ik.toVisualize.chainDir, ik.toVisualize.pos, len, "yellow", 0.01 );
        // scene.add(arrow);
        // arrow = new THREE.ArrowHelper( ik.toVisualize.newJointDir, ik.toVisualize.pos, len, "red", 0.01 );
        // scene.add(arrow);
    }
}

class IKSolver {
    constructor(skeleton, chain) {
        this.skeleton = skeleton;
        this.chain = chain;
        this.target = chain.target;
        this.forward = new THREE.Vector3(0,0,1);
        this.left = new THREE.Vector3(1,0,0);
        this.up = new THREE.Vector3(0,1,0);
    }

    solve(pose, forward, up) {
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
        direction = chain.alt_up.clone().applyQuaternion(rotation).normalize(); // new UP direction based only swing
        let twist = direction.angleTo(this.up); // Get difference between Swing UP and Target UP
       
        if(twist <= 0.01*Math.PI/180) {
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
    return Math.acos((Math.pow(a,2) + Math.pow(b,2) - Math.pow(c,2)) / (2*a*b));
}