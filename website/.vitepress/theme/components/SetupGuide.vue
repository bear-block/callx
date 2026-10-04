<script setup lang="ts">
import {computed, onMounted, reactive, ref, watch} from 'vue';
import {withBase} from 'vitepress';
import {buildPlan, choices, defaults} from '../setup/plan';
import {generateCode} from '../setup/code';
const selection = reactive({...defaults});
const ready = ref(false);
onMounted(() => { ready.value = true; });
const plan = computed(() => buildPlan(selection));
const video = ref(true);
const generated = computed(() => generateCode(selection, video.value));
const selectedFile = ref('');
const activeFile = computed(() => generated.value.files.find(file => file.name === selectedFile.value) ?? generated.value.files[0]);
const copyStatus = ref('');
watch([selection, video, selectedFile], () => { copyStatus.value = ''; }, {deep: true});
async function copyCode() {
  const file = activeFile.value;
  if (!file) return;
  try {
    await navigator.clipboard.writeText(file.code);
    if (activeFile.value === file) copyStatus.value = `Copied ${file.name}`;
  } catch {
    copyStatus.value = 'Clipboard unavailable. Select and copy the code below.';
  }
}
const labels = {framework: 'Your app', platform: 'Target platforms', ui: 'Accepted-call UI', media: 'Media provider', backend: 'Signaling backend', migration: 'Starting point'};
</script>

<template>
  <section class="setup-guide" aria-label="Personalize your Callx setup">
    <div class="setup-options">
      <label v-for="(options, key) in choices" :key="key" :for="`setup-${key}`">
        <span>{{ labels[key] }}</span>
        <select :id="`setup-${key}`" v-model="selection[key]" :disabled="!ready">
          <option v-for="[value, label] in options" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
    </div>
    <label class="setup-video"><input type="checkbox" v-model="video" :disabled="!ready"> Include video permissions, cover views and explicit camera controls</label>
    <p class="setup-boundary">Native owns the call in every UI mode. Incoming system presentation and the accepted-call screen are separate choices.</p>
    <div v-if="plan.blockers.length" role="status" class="setup-blocked">
      <strong>This combination is not available yet</strong>
      <ul><li v-for="reason in plan.blockers" :key="reason">{{ reason }}</li></ul>
      <p>Choose released options to get an integration path. <a :href="withBase('/project/roadmap')">Read the roadmap</a> or <a :href="withBase('/guides/native-host')">explore current native host hooks</a>.</p>
    </div>
    <div v-else>
      <h2>Your integration path</h2>
      <p>Start with these packages, then follow every checkpoint below.</p>
      <pre aria-label="Package installation commands"><code>{{ plan.commands.join('\n') }}</code></pre>
      <h2 id="generated-code">Your starter code</h2>
      <p>Generated for your current choices. TypeScript/TSX for React Native and Expo; Dart for Flutter. Native fragments are labeled separately.</p>
      <div class="code-files" aria-label="Generated files">
        <button v-for="file in generated.files" :key="file.name" type="button"
          :aria-pressed="activeFile?.name === file.name" @click="selectedFile = file.name">{{ file.name }}</button>
      </div>
      <div v-if="activeFile" class="code-preview">
        <div class="code-heading"><strong>{{ activeFile.name }}</strong>
          <button type="button" :disabled="!ready" @click="copyCode">Copy code</button></div>
        <p>{{ activeFile.purpose }}</p>
        <pre :aria-label="`Generated ${activeFile.name}`"><code :class="`language-${activeFile.language}`">{{ activeFile.code }}</code></pre>
      </div>
      <p role="status" aria-live="polite" class="copy-status">{{ copyStatus }}</p>
      <details><summary>What you still need to wire up</summary>
        <ul><li v-for="note in generated.notes" :key="note">{{ note }}</li></ul>
      </details>
      <h2>Integration checkpoints</h2>
      <ol class="setup-steps">
        <li v-for="step in plan.steps" :key="step.title">
          <h3>{{ step.title }}</h3>
          <p>{{ step.detail }}</p>
          <p class="setup-check"><strong>Check:</strong> {{ step.check }}</p>
          <a :href="withBase(step.link)">Open this step →</a>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.setup-options { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; margin: 24px 0; }
label span { display: block; font-weight: 600; margin-bottom: 6px; }
select { width: 100%; border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 10px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: inherit; }
select:focus-visible { outline: 3px solid var(--vp-c-brand-1); outline-offset: 2px; }
.setup-boundary { color: var(--vp-c-text-2); font-size: 14px; }
.setup-blocked { padding: 20px; background: var(--vp-c-warning-soft); border-radius: 12px; }
.setup-steps { padding-left: 24px; }
.setup-steps li { padding: 0 0 20px 8px; border-bottom: 1px solid var(--vp-c-divider); }
.setup-steps h3 { margin-top: 20px; }
.setup-check { background: var(--vp-c-bg-soft); padding: 12px; border-radius: 8px; font-size: 14px; }
pre { overflow-x: auto; padding: 16px; background: var(--vp-c-bg-soft); border-radius: 8px; }
.setup-video { display: flex; align-items: baseline; gap: 10px; font-size: 14px; }
.setup-video input { appearance: auto; }
.code-files { display: flex; flex-wrap: wrap; gap: 8px; }
.code-files button, .code-heading button { padding: 6px 10px; border: 1px solid var(--vp-c-divider); border-radius: 8px; font-size: 12px; overflow-wrap: anywhere; }
.code-files button[aria-pressed="true"] { background: var(--vp-c-brand-soft); border-color: var(--vp-c-brand-1); }
.code-heading { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-top: 20px; }
.code-preview { min-width: 0; }
.code-preview p, details { font-size: 14px; }
.code-preview pre { max-height: 480px; font-size: 12px; line-height: 1.7; tab-size: 2; }
.copy-status { min-height: 24px; font-size: 13px; color: var(--vp-c-brand-1); }
summary { cursor: pointer; font-weight: 600; }
button:focus-visible { outline: 3px solid var(--vp-c-brand-1); outline-offset: 2px; }
@media (max-width: 640px) { .setup-options { grid-template-columns: 1fr; } }
</style>
