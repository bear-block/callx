package dev.callx.core

import java.io.File
import kotlinx.serialization.json.*
import kotlin.test.Test
import kotlin.test.assertFailsWith

class ContractFixtureTest {
    private val root = File("../..").canonicalFile
    private val json = Json
    private val manifest = json.parseToJsonElement(File(root, "contracts/v0/manifest.json").readText()).jsonObject
    private val fixtures = json.parseToJsonElement(File(root, "contracts/v0/fixtures.json").readText()).jsonObject
    private val validator = ContractValidator(manifest)

    @Test fun canonicalFixtures() {
        fixtures.getValue("valid").jsonArray.forEach { validator.fixture(it.jsonObject) }
        fixtures.getValue("invalid").jsonArray.forEach { fixtureElement ->
            val fixture = fixtureElement.jsonObject; val path = fixture.getValue("path").jsonPrimitive.content
            val value = fixture.getValue("value")
            assertFailsWith<ContractViolation> {
                when (path) {
                    "event.sequence" -> validator.fixture(buildJsonObject { putJsonObject("event") {
                        put("contractVersion", "0.3.0"); put("eventId", "invalid-event"); put("sequence", value)
                        put("kind", "callChanged"); put("source", "local"); put("observedAtMs", 0)
                    } })
                    "command.operationId" -> validator.fixture(buildJsonObject { putJsonObject("command") {
                        put("contractVersion", "0.3.0"); put("operationId", value); put("type", "answer"); put("callId", "call-1")
                    } })
                    else -> validator.fixture(buildJsonObject { put(path, value) })
                }
            }
        }
    }
}
