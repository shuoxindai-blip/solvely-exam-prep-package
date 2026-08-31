<script setup lang="ts">
const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <aside class="reference-sheet" role="dialog" aria-modal="false" aria-label="Math reference sheet">
    <div class="reference-titlebar">
      <strong>Reference Sheet</strong>
      <button type="button" aria-label="Close reference sheet" @click="emit('close')">×</button>
    </div>
    <div class="reference-content">
      <section class="reference-figure">
        <svg viewBox="0 0 360 330" role="img" aria-label="Circle with radius r">
          <circle cx="180" cy="145" r="118" />
          <circle class="filled" cx="180" cy="145" r="9" />
          <path d="M180 145h118" />
          <text x="238" y="128">r</text>
        </svg>
        <p><i>A</i> = π<i>r</i><sup>2</sup></p>
        <p><i>C</i> = 2π<i>r</i></p>
      </section>

      <div class="reference-rule" />

      <section>
        <h2>Formulas</h2>
        <div class="formula-grid">
          <p>Rectangle: <i>A</i> = <i>lw</i></p>
          <p>Triangle: <i>A</i> = ½<i>bh</i></p>
          <p>Rectangular prism: <i>V</i> = <i>lwh</i></p>
          <p>Cylinder: <i>V</i> = π<i>r</i><sup>2</sup><i>h</i></p>
          <p>Pythagorean theorem: <i>a</i><sup>2</sup> + <i>b</i><sup>2</sup> = <i>c</i><sup>2</sup></p>
          <p>Slope: <i>m</i> = (<i>y</i><sub>2</sub> − <i>y</i><sub>1</sub>) / (<i>x</i><sub>2</sub> − <i>x</i><sub>1</sub>)</p>
          <p>Quadratic formula: <i>x</i> = (−<i>b</i> ± √(<i>b</i><sup>2</sup> − 4<i>ac</i>)) / 2<i>a</i></p>
        </div>
      </section>

      <div class="reference-rule" />

      <section>
        <h2>Special Right Triangles</h2>
        <div class="triangle-row">
          <svg viewBox="0 0 180 150" role="img" aria-label="45 45 90 triangle">
            <path d="M25 125h120L25 25Z" />
            <text x="2" y="77">x</text><text x="76" y="144">x</text><text x="78" y="68">x√2</text>
            <text x="29" y="117">90°</text><text x="31" y="42">45°</text><text x="119" y="117">45°</text>
          </svg>
          <svg viewBox="0 0 180 150" role="img" aria-label="30 60 90 triangle">
            <path d="M25 125h130L25 25Z" />
            <text x="2" y="77">x√3</text><text x="76" y="144">x</text><text x="91" y="67">2x</text>
            <text x="29" y="117">90°</text><text x="31" y="42">30°</text><text x="126" y="117">60°</text>
          </svg>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.reference-sheet {
  position: fixed;
  z-index: 90;
  top: 62px;
  left: clamp(18px, 12vw, 240px);
  width: min(510px, calc(100vw - 36px));
  height: min(665px, calc(100dvh - 92px));
  overflow: hidden;
  border: 1px solid #d3d3d3;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
  color: #161616;
}

.reference-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 58px;
  padding: 0 17px;
  border-bottom: 1px solid #ededed;
  font-family: Arial, Helvetica, sans-serif;
}

.reference-titlebar strong {
  font-size: 17px;
}

.reference-titlebar button {
  padding: 4px 8px;
  border: 0;
  background: transparent;
  color: #4d4d4d;
  font-size: 30px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
}

.reference-content {
  height: calc(100% - 58px);
  padding: 18px 23px 35px;
  overflow: auto;
  font-family: Georgia, 'Times New Roman', serif;
  scrollbar-color: #b5b5b5 transparent;
  scrollbar-width: thin;
}

.reference-figure {
  text-align: center;
}

.reference-figure svg {
  width: min(100%, 370px);
  height: auto;
}

.reference-figure circle,
.reference-figure path,
.triangle-row path {
  fill: none;
  stroke: #161616;
  stroke-width: 4;
}

.reference-figure .filled {
  fill: #161616;
}

.reference-figure text {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 31px;
  font-style: italic;
}

.reference-figure p {
  margin: 2px 0;
  font-size: 28px;
}

.reference-rule {
  height: 1px;
  margin: 24px 0;
  background: #d6d6d6;
}

.reference-content h2 {
  margin: 0 0 17px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 18px;
}

.formula-grid {
  display: grid;
  gap: 11px;
  font-size: 18px;
}

.formula-grid p {
  margin: 0;
}

.triangle-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.triangle-row svg {
  width: 100%;
  height: auto;
}

.triangle-row text {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 13px;
}

@media (max-width: 680px) {
  .reference-sheet {
    top: 72px;
    left: 12px;
    width: calc(100vw - 24px);
    height: calc(100dvh - 96px);
  }
}
</style>
