import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FABRIKSolver, CCDIKSolver } from './IKSolver.js'
import { IKCompute, IKRig, IKPose, IKSolver, IKVisualize } from './IKRig.js';

class App {
    constructor() {
        this.elapsedTime = 0; // clock is ok but might need more time control to dinamicaly change signing speed
        this.clock = new THREE.Clock();
        this.loaderGLB = new GLTFLoader();
        this.loadedCharacters = {};
        this.sourceName = "bmlTest.glb";
        this.targetName = "mixamo.glb";

        this.playing = false;
    }

    init() {
        this.initScene();
        IKVisualize.sourceName = this.sourceName;
        IKVisualize.targetName = this.targetName;
        this.loadAvatar("./data/" + this.sourceName, this.sourceName, true, () => {

            // this.initRig(this.sourceName, true);
            const source = this.loadedCharacters[this.sourceName];
            let rig = new IKRig();
            rig.init(source.skeleton, false, true);
            source.IKPose = new IKPose();
            source.IKrig = rig;
            IKCompute.run(rig, source.IKPose);
            IKVisualize.run(rig, source.IKPose, this.scene, this.sourceName);

            this.loadAvatar("./data/" +this.targetName, this.targetName, false, () => {
                this.loadedCharacters[this.targetName].model.position.x = 0.5;

                const current = this.loadedCharacters[this.targetName];
                let crig = new IKRig();
                current.skeleton.pose();
                crig.init(current.skeleton, true, true, this.targetName == "robo_trex" ? 0 : 1);

                if(this.targetName == "robo_trex") {
                    crig.addPoint( "hip", "hip" )
                    crig.addPoint( "head", "face_joint" )
                    crig.addPoint( "foot_l", "LeftFoot" )
                    crig.addPoint( "foot_r", "RightFoot" )

                    crig.addPoint( "wing_l", "left_wing" )
                    crig.addPoint( "wing_r", "right_wing" )

                    crig.addChain( "leg_r", [ "RightUpLeg", "RightKnee", "RightShin" ], "RightFoot", "three_bone" ) //"z", 
                    crig.addChain( "leg_l", [ "LeftUpLeg", "LeftKnee", "LeftShin" ], "LeftFoot", "three_bone" ) // "z", 
                    crig.addChain( "spine", [ "Spine", "Spine1" ] )
                    crig.addChain( "tail", ["tail_1","tail_2","tail_3","tail_4","tail_5","tail_6","tail_7"] )
                    // .set_leg_lmt( null, -0.1 )
                }
                current.IKPose = new IKPose();
                
                current.IKrig = crig;
                
                source.IKPose.applyRig(crig, current.IKPose);
                // IKCompute.run(crig, current.IKPose);
                if(crig.ikSolver) {
                    crig.ikSolver.update();
                }
                IKVisualize.run(crig, current.IKPose, this.scene, this.targetName);
                // current.model.position.y = 1.5;
                // current.model.position.z = -1.5;
                // current.model.position.x = -1.5;
                this.animate();

                window.addEventListener("keyup", (event) => {
                    switch(event.key) {
                        case " ":
                            this.playing = !this.playing;
                            if(this.playing) {
                                this.retarget();
                            }
                            break;
                    
                        case "Escape":
                            this.mixer.setTime(0);
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
                        case "p":
                        this.loadedCharacters[this.sourceName].skeleton.pose();
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
                this.mixer = new THREE.AnimationMixer(skeleton.bones[0]);
                this.mixer.clipAction(glb.animations[0]).setEffectiveWeight(1.0).play();
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
        // IKCompute.run(this.loadedCharacters[this.targetName].IKrig, this.loadedCharacters[this.targetName].IKPose);

        IKVisualize.run(this.loadedCharacters[this.targetName].IKrig, this.loadedCharacters[this.targetName].IKPose, this.scene, this.targetName);
    }
}

export {App}
