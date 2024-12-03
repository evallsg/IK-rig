import * as THREE from 'three'
import { IKChain } from './IKChain.js';
import { HipSolver, LimbSolver, SwingTwistSolver } from './IKSolvers.js'
import { findIndexOfBoneByName } from './retargeting.js';

const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const LEFT = new THREE.Vector3(1, 0, 0);

const BACK = new THREE.Vector3(0, 0, -1);
const DOWN = new THREE.Vector3(0, -1, 0);
const RIGHT = new THREE.Vector3(-1, 0, 0);

const BONEMAP = {
    "LEye":           "lefteye",
    "REye":           "righteye",
    "Head":           "head",
    "Neck":           "neck",
    "ShouldersUnion": "spine2", // chest
    "Stomach":  	  "spine1",
    "BelowStomach":   "spine",
    "Hips":			  "hips",
    "RShoulder":      "rightshoulder",
    "RArm":           "rightarm",
    "RElbow":         "rightforearm",
    "RHandThumb":     "righthandthumb1",
    "RHandThumb2":    "righthandthumb2",
    "RHandThumb3":    "righthandthumb3",
    "RHandThumb4":    "righthandthumb4",
    "RHandIndex":     "righthandindex1",
    "RHandIndex2":    "righthandindex2",
    "RHandIndex3":    "righthandindex3",
    "RHandIndex4":    "righthandindex4",
    "RHandMiddle":    "righthandmiddle1",
    "RHandMiddle2":   "righthandmiddle2",
    "RHandMiddle3":   "righthandmiddle3",
    "RHandMiddle4":   "righthandmiddle4",
    "RHandRing":      "righthandring1",
    "RHandRing2":     "righthandring2",
    "RHandRing3":     "righthandring3",
    "RHandRing4":     "righthandring4",
    "RHandPinky":     "righthandpinky1",
    "RHandPinky2":    "righthandpinky2",
    "RHandPinky3":    "righthandpinky3",
    "RHandPinky4":    "righthandpinky4",
    "RWrist":         "righthand",
    "LShoulder":      "leftshoulder",
    "LArm":           "leftarm",
    "LElbow":         "leftforearm",
    "LHandThumb":     "lefthandthumb1",
    "LHandThumb2":    "lefthandthumb2",
    "LHandThumb3":    "lefthandthumb3",
    "LHandThumb4":    "lefthandthumb4",
    "LHandIndex":     "lefthandindex1",
    "LHandIndex2":    "lefthandindex2",
    "LHandIndex3":    "lefthandindex3",
    "LHandIndex4":    "lefthandindex4",
    "LHandMiddle":    "lefthandmiddle1",
    "LHandMiddle2":   "lefthandmiddle2",
    "LHandMiddle3":   "lefthandmiddle3",
    "LHandMiddle4":   "lefthandmiddle4",
    "LHandRing":      "lefthandring1",
    "LHandRing2":     "lefthandring2",
    "LHandRing3":     "lefthandring3",
    "LHandRing4":     "lefthandring4",
    "LHandPinky":     "lefthandpinky1",
    "LHandPinky2":    "lefthandpinky2",
    "LHandPinky3":    "lefthandpinky3",
    "LHandPinky4":    "lefthandpinky4",
    "LWrist":         "lefthand",
    "LUpLeg":         "leftupleg",
    "LLeg":           "leftleg",
    "LFoot":          "leftfoot",
    "RUpLeg":         "rightupleg",
    "RLeg":           "rightleg",
    "RFoot":          "rightfoot",
};

const BONEMAP2 = {
    "LEye":           "lefteye",
    "REye":           "righteye",
    "Head":           "head",
    "Neck":           "neck",
    "ShouldersUnion": "spine3", // chest
    "Stomach":  	  "spine2",
    "BelowStomach":   "spine1",
    "Hips":			  "hips",
    "RShoulder":      "rightshoulder",
    "RArm":           "rightarm",
    "RElbow":         "rightforearm",
    "RHandThumb":     "righthandthumb1",
    "RHandThumb2":    "righthandthumb2",
    "RHandThumb3":    "righthandthumb3",
    "RHandThumb4":    "righthandthumb4",
    "RHandIndex":     "righthandindex1",
    "RHandIndex2":    "righthandindex2",
    "RHandIndex3":    "righthandindex3",
    "RHandIndex4":    "righthandindex4",
    "RHandMiddle":    "righthandmiddle1",
    "RHandMiddle2":   "righthandmiddle2",
    "RHandMiddle3":   "righthandmiddle3",
    "RHandMiddle4":   "righthandmiddle4",
    "RHandRing":      "righthandring1",
    "RHandRing2":     "righthandring2",
    "RHandRing3":     "righthandring3",
    "RHandRing4":     "righthandring4",
    "RHandPinky":     "righthandpinky1",
    "RHandPinky2":    "righthandpinky2",
    "RHandPinky3":    "righthandpinky3",
    "RHandPinky4":    "righthandpinky4",
    "RWrist":         "righthand",
    "LShoulder":      "leftshoulder",
    "LArm":           "leftarm",
    "LElbow":         "leftforearm",
    "LHandThumb":     "lefthandthumb1",
    "LHandThumb2":    "lefthandthumb2",
    "LHandThumb3":    "lefthandthumb3",
    "LHandThumb4":    "lefthandthumb4",
    "LHandIndex":     "lefthandindex1",
    "LHandIndex2":    "lefthandindex2",
    "LHandIndex3":    "lefthandindex3",
    "LHandIndex4":    "lefthandindex4",
    "LHandMiddle":    "lefthandmiddle1",
    "LHandMiddle2":   "lefthandmiddle2",
    "LHandMiddle3":   "lefthandmiddle3",
    "LHandMiddle4":   "lefthandmiddle4",
    "LHandRing":      "lefthandring1",
    "LHandRing2":     "lefthandring2",
    "LHandRing3":     "lefthandring3",
    "LHandRing4":     "lefthandring4",
    "LHandPinky":     "lefthandpinky1",
    "LHandPinky2":    "lefthandpinky2",
    "LHandPinky3":    "lefthandpinky3",
    "LHandPinky4":    "lefthandpinky4",
    "LWrist":         "lefthand",
    "LUpLeg":         "thighl",
    "LLeg":           "shinl",
    "LFoot":          "footl",
    "RUpLeg":         "thighr",
    "RLeg":           "shinr",
    "RFoot":          "footr",
};
/**
 * Maps automatically bones from the skeleton to an auxiliar map. 
 * Given a null bonemap, an automap is performed
 * @param {THREE.Skeleton} srcSkeleton 
 * @returns {object} { idxMap: [], nameMape: {} }
 */
function computeAutoBoneMap( skeleton, replace = false ){
    const auxBoneMap = Object.keys(BONEMAP2);
    let bones = skeleton.bones;
    let result = {
        idxMap: new Int16Array( auxBoneMap.length ),
        nameMap: {} 
    };

    result.idxMap.fill( -1 ); // default to no map;
    // automap
    for(let i = 0; i < auxBoneMap.length; i++) {
        const auxName = auxBoneMap[i];
        for( let j = 0; j < bones.length; ++j ){
            let name = bones[j].name;
            if ( typeof( name ) !== "string" ){ continue; }
            name = name.toLowerCase().replace( "mixamorig", "" ).replace( /[`~!@#$%^&*()_|+\-=?;:'"<>\{\}\\\/]/gi, "" );
            if ( name.length < 1 ){ continue; }
            if(name.toLowerCase().includes(auxName.toLocaleLowerCase()) || name.toLowerCase().includes(BONEMAP2[auxName].toLocaleLowerCase())) {
                if(replace) {
                    result.nameMap[name] = bones[j].name;
                }
                else {
                    result.nameMap[auxName] = bones[j].name;
                }
                result.idxMap[i] = j;
                break;
            }
        }                
    }
    return result;
}

class IKRig {
    chains = {};
    constructor( ) {}

    // Change the Bind Transform for all the chains
    // Mostly used for late binding a TPose when armature isn't naturally in a TPose
    bindPose( pose ) {

        for( let chain of this.chains.values() ) {
            chain.bindToPose( pose );
        }
        return this;
    }

    updateBoneLengths( pose ) {

        for( let chain of this.chains.values() ) {
            chain.resetLengths( pose );
        }

        return this;
    }

    addChain( skeleton, name, bonesName) {
        const chain = new IKChain(skeleton, name, bonesName );
        this.chains[name] = chain;
        return chain;
    }

}

class BipedRig extends IKRig {

    hip = null;
    spine = null;
    neck = null;
    head = null;
    leftArm = null;
    rightArm = null;
    leftLeg = null;
    rightLeg = null;
    leftHand = null;
    rightHand = null;
    leftFoot = null;
    rightFoot = null;

    constructor( ) {
        super();
    }

    autorig(skeleton) {
        const map = computeAutoBoneMap(skeleton, true);
        let isComplete = true;

        let names = [];

        const chains = {
            "hip": { ch: ["hips"] },
            "spine": { ch: ["spine1", "spine2", "spine3"] },
            "leftLeg": { ch: ["thighl", "shinl"] },
            "rightLeg": { ch: ["thighr", "shinr"] },
            "leftArm": { ch: ["leftupperarm", "leftforearm"] },
            "rightArm": { ch: ["rightupperarm", "rightforearm"] },
            "neck": { ch: ["neck"] },
            "head": { ch: ["head"] },
            "rightHand": { ch: ["lefthand"] },
            "handR": { ch: ["righthand"] },
            "leftFoot": { ch: ["footl"] },
            "rightFoot": { ch: ["footr"] }
        };

        for (let name in chains) {
            const chain = chains[name];
            names.length = 0;
            for (let i = 0; i < chain.ch.length; i++) {
                const bone = map.nameMap[chain.ch[i]];
                if (!bone) {
                    console.log("AutoRig - Missing ", chain.ch[i]);
                    isComplete = false;
                    break;
                }
                names.push(bone);
            }

            this[name] = this.addChain(skeleton, name, names);
        }
        this.setDirection(skeleton);   
        
        return isComplete;     
    }
    
    setDirection( pose ) {
      
        if( this.hip ) {
            this.hip.bindDirections( pose, FORWARD, UP );
        }
        if( this.spine ) {
            this.spine.bindDirections( pose, UP, FORWARD );
        }
        if( this.neck ) {
            this.neck.bindDirections( pose, FORWARD, UP );
        }
        if( this.head ) {
            this.head.bindDirections( pose, FORWARD, UP );
        }
        
        if( this.leftLeg ) {
            this.leftLeg.bindDirections( pose, DOWN, FORWARD );
        }
        if( this.rightLeg ) {
            this.rightLeg.bindDirections( pose, DOWN, FORWARD );
        }
        if( this.leftFoot ) {
            this.leftFoot.bindDirections( pose, FORWARD, UP );
        }
        if( this.rightFoot ) {
            this.rightFoot.bindDirections( pose, FORWARD, UP );
        }

        if( this.leftArm ) { 
            this.leftArm.bindDirections( pose, LEFT, BACK );
        }
        if( this.rightArm ) { 
            this.rightArm.bindDirections( pose, RIGHT, BACK );
        }
        if( this.leftHand ) {
            this.leftHand.bindDirections( pose, LEFT, BACK );
        }
        if( this.rightHand ) {
            this.rightHand.bindDirections( pose, RIGHT, BACK );
        }
    }

     /** Use Solver Configuration for Fullbody IK */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    useSolversForFBIK( pose ) {
        if( this.hip ) {
            this.hip.setSolver( new HipSolver().init( pose, this.hip ) );
        }
        // if( this.head ) {
        //     this.head.setSolver( new SwingTwistSolver().init( pose, this.head ) );
        // }
        // if( this.leftArm ) {
        //     this.leftArm.setSolver( new LimbSolver().init( pose, this.leftArm ) );
        // }
        // if( this.rightArm ) {
        //     this.rightArm.setSolver( new LimbSolver().init( pose, this.rightArm ) );
        // }
        if( this.leftLeg ) {
            this.leftLeg.setSolver( new LimbSolver().init( pose, this.leftLeg ) );
        }
        if( this.rightLeg ) {
            this.rightLeg.setSolver( new LimbSolver().init( pose, this.rightLeg ) );
        }
        if( this.leftFoot ) {
            this.leftFoot.setSolver( new SwingTwistSolver().init( pose, this.leftFoot ) );
        }
        if( this.rightFoot ) {
            this.rightFoot.setSolver( new SwingTwistSolver().init( pose, this.rightFoot ) );
        }
        // if( this.leftHand ) {
        //     this.leftHand.setSolver( new SwingTwistSolver().init( pose, this.leftHand ) );
        // }
        // if( this.rightHand ) {
        //     this.rightHand.setSolver( new SwingTwistSolver().init( pose, this.rightHand ) );
        // }
        // if( this.spine ) {
        //     this.spine.setSolver( new SwingTwistChainSolver().init( pose, this.spine ) );
        // }
        // return this;
    }

    resolveToPose( pose, debug = false ){
        
        for( let ch in this.chains ){
            if( this.chains[ch].solver ) {
                this.chains[ch].resolveToPose( pose, debug );
            }
        }
        //console.timeEnd( 'resolveToPose' );
    }
}


export { IKRig, BipedRig }