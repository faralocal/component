/**
 * Zog.js Component Plugin
 * 
 * Enables a component system with:
 * - Isolated Scope
 * - Reactive Props (Parent -> Child)
 * - Event Emitting (Child -> Parent)
 * - Slot Support (Parent Scope)
 * 
 * @version 1.0.0
 * @license MIT
 */

export const ComponentPlugin = {
    install(api) {
        // Destructure necessary tools from the Core API
        const { utils, addHook, watchEffect, reactive } = api;
        const componentRegistry = new Map();

        /**
         * Global Error Handler
         * Zog.js catches errors within hooks internally. 
         * This ensures they are visible in the console for debugging.
         */
        addHook('onError', (err, context, args) => {
            console.error(`[Zog Error in ${context}]`, err);
            if (args) console.error('Context Args:', args);
        });

        /**
         * Component Registration Method
         * Exposed to the app instance.
         */
        const registerComponent = (name, options) => {
            if (!options.template) {
                console.warn(`[ComponentPlugin] Component "${name}" is missing a template.`);
                return;
            }
            // Store component names in lowercase for consistent matching
            componentRegistry.set(name.toLowerCase(), options);
        };

        /**
         * Compilation Hook
         * Intercepts DOM elements before Zog compiles them to inject components.
         */
        addHook('beforeCompile', (el, scope, cs) => {
            // Only process element nodes
            if (el.nodeType !== 1) return;

            const tagName = el.tagName.toLowerCase();
            // Handle both <z-card> and <card> naming conventions
            const componentName = tagName.startsWith('z-') ? tagName.slice(2) : tagName;

            if (componentRegistry.has(componentName)) {
                const def = componentRegistry.get(componentName);
                
                // 1. Create the Template DOM
                const tempContainer = document.createElement('div');
                tempContainer.innerHTML = def.template.trim();
                const componentRoot = tempContainer.firstElementChild;

                if (!componentRoot) {
                    console.error(`[ComponentPlugin] Template for <${componentName}> must have a single root element.`);
                    return false;
                }

                // 2. Initialize Isolated Child Data
                const childData = reactive({});
                const parentListeners = {};

                // 3. Inject '$emit' method into Child Scope
                // Defined as non-writable/enumerable to act like a system method
                Object.defineProperty(childData, 'emit', {
                    value: (eventName, ...args) => {
                        const handlerCode = parentListeners[eventName];
                        
                        if (!handlerCode) {
                            console.warn(`[Emit] No listener found on parent for event "${eventName}"`);
                            return;
                        }

                        // Execute the handler in the PARENT scope
                        if (typeof scope[handlerCode] === 'function') {
                            // Scenario: @update="handleUpdate"
                            scope[handlerCode](...args);
                        } else {
                            // Scenario: @update="count += 1"
                            try {
                                const fnKeys = Object.keys(scope);
                                const fnValues = Object.values(scope);
                                // Create a temporary function with access to parent scope
                                const fn = new Function(...fnKeys, '$event', `"use strict"; return (${handlerCode})`);
                                fn(...fnValues, args[0]);
                            } catch (e) {
                                console.error(`[Emit Failed] Could not execute handler: "${handlerCode}"`, e);
                            }
                        }
                    },
                    writable: false,
                    enumerable: true, // Must be enumerable to be visible in template expressions
                    configurable: false
                });

                // 4. Process Attributes (Props, Events, Styles, Classes)
                Array.from(el.attributes).forEach(attr => {
                    const { name, value } = attr;
                    
                    if (name.startsWith(':')) {
                        // Dynamic Prop: :title="pageTitle"
                        const propName = name.slice(1);
                        
                        // Create a Watcher to sync Parent Data -> Child Prop
                        cs.addEffect(watchEffect(() => {
                            try {
                                childData[propName] = utils.evalExp(value, scope);
                            } catch (e) {
                                console.error(`[Prop Error] Failed to evaluate ":${propName}"`, e);
                            }
                        }));
                    } 
                    else if (name.startsWith('@')) {
                        // Event Listener: @click="doSomething"
                        const eventName = name.slice(1);
                        parentListeners[eventName] = value;
                    } 
                    else if (name === 'class') {
                        // Merge Classes
                        componentRoot.classList.add(...value.split(' '));
                    } 
                    else if (name === 'style') {
                        // Merge Styles
                        componentRoot.style.cssText += ';' + value;
                    } 
                    else {
                        // Static Prop: title="Home"
                        childData[name] = value;
                    }
                });

                // 5. Handle Slots
                // Slot content must be compiled in the PARENT scope before moving
                const slot = componentRoot.querySelector('slot');
                if (slot) {
                    while (el.childNodes.length > 0) {
                        const child = el.childNodes[0];
                        // Manually compile child with Parent Scope
                        utils.compile(child, scope, cs); 
                        slot.parentNode.insertBefore(child, slot);
                    }
                    slot.remove();
                }

                // 6. DOM Replacement & Final Compilation
                el.replaceWith(componentRoot);
                
                // Create a new Scope for the component
                const componentScope = new utils.Scope(childData);
                
                // Compile the component template using Child Scope
                utils.compile(componentRoot, childData, componentScope);

                // Return false to stop the main compiler from processing the removed node
                return false; 
            }

            // Return true to continue standard compilation
            return true; 
        });

        // Return the API to be used via: const { registerComponent } = app.use(...)
        return { registerComponent };
    }
};
