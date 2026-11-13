/**
 * 평원 장면 (1단계 빈 3D 장면): 굴곡 있는 초원, 개울과 나무 다리, 흙길, 숲·풀·꽃·바위.
 * 2단계부터 이 위에 부대를 올린다.
 */
import * as THREE from 'three';
import { kitMaterials, plankBridge } from '../models/kit';
import { buildFoliage, buildGround, plainColor, plainHeight, roadZ, streamZ, waterMesh } from '../terrain';
import type { Stage, World3D } from '../world';

export class FieldStage implements Stage {
  tilt = { band: 0.17, amt: 4.5 };
  /** 지면 높이 (부대 배치용) */
  readonly heightAt = plainHeight;

  build(w: World3D): void {
    const sc = w.scene;
    sc.add(buildGround(w.U, 240, 170, 160, 112, plainHeight, plainColor, 'plain'));
    const water = waterMesh(w.U, 260, 24, 0.85);
    water.position.set(0, -0.42, -25);
    sc.add(water);
    const br = new THREE.Mesh(plankBridge(), kitMaterials().toy);
    br.position.set(-6, 0, streamZ(-6));
    br.castShadow = br.receiveShadow = true;
    sc.add(br);
    sc.add(
      buildFoliage(w.U, plainHeight, {
        trees: 300,
        pines: 0.35,
        // 절약 단계는 풀·꽃을 절반만 (삼각형 예산 30만, 전달서 5장)
        tufts: w.quality === 'saver' ? 1900 : 3800,
        flowers: w.quality === 'saver' ? 450 : 900,
        rocks: 70,
        treeOk: (x, z) => (Math.abs(z) > 24 || Math.abs(x) > 46) && Math.abs(z - streamZ(x)) > 3,
        tuftOk: (x, z) => Math.abs(z - streamZ(x)) > 2.6 && Math.abs(z - roadZ(x)) > 1.6,
      }),
    );
    const cam = w.cam;
    cam.minD = 9;
    cam.maxD = 95;
    cam.bounds = [-50, 50, -32, 32];
    cam.set(0, 0, 0, 0.12, 0.62, 62, true);
    w.env.fogNear = 75;
    w.env.fogFar = 240;
  }

  /** 평상시 전열 관전: 좌우로 천천히 흐른다 (사용자가 만지면 4초 멈춤) */
  update(dt: number, w: World3D): void {
    const cam = w.cam;
    if (cam.hold > 0 || cam.lock) return;
    const t = w.U.time.value;
    cam.Y = 0.12 + Math.sin(t * 0.05) * 0.18;
    void dt;
  }
}
