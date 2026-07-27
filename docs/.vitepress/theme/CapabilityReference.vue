<script setup lang="ts">
import { capabilityDefinitions } from "../../../src/features/Capabilities/application/capability-registry";
</script>

<template>
  <div class="capability-reference">
    <section
      v-for="definition in capabilityDefinitions"
      :id="definition.id"
      :key="definition.id"
      class="capability-card"
    >
      <header>
        <div>
          <h2>{{ definition.title }}</h2>
          <code>environment.{{ definition.id }}</code>
        </div>
        <p>{{ definition.description }}</p>
      </header>

      <div class="capability-grants">
        <h3>子权限</h3>
        <dl>
          <template v-for="(description, subCapId) in definition.subCaps" :key="subCapId">
            <dt><code>{{ subCapId }}</code></dt>
            <dd>{{ description }}</dd>
          </template>
        </dl>
      </div>

      <div
        v-for="(items, subCapId) in definition.api"
        :key="subCapId"
        class="capability-api-group"
      >
        <h3>{{ definition.subCaps[subCapId] }} <code>{{ subCapId }}</code></h3>
        <article v-for="item in items" :key="item.name" class="capability-api">
          <h4><code>{{ definition.id }}.{{ item.signature }}</code></h4>
          <p>{{ item.description }}</p>
          <p v-if="item.returns"><strong>返回：</strong>{{ item.returns }}</p>
          <pre v-if="item.example"><code>{{ item.example }}</code></pre>
        </article>
      </div>
    </section>
  </div>
</template>
