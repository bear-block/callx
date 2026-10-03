<script setup lang="ts">
import {computed, onMounted, reactive, ref} from 'vue';
import {withBase} from 'vitepress';
import {buildPlan, choices, defaults} from '../setup/plan';
const selection = reactive({...defaults});
const ready = ref(false);
onMounted(() => { ready.value = true; });
const plan = computed(() => buildPlan(selection));
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
@media (max-width: 640px) { .setup-options { grid-template-columns: 1fr; } }
</style>
