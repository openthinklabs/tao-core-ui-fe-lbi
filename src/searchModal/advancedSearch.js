/**
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; under version 2
 * of the License (non-upgradable).
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 *
 * Copyright (c) 2021 (original work) Open Assessment Technologies SA ;
 */

import $ from 'jquery';
import _ from 'lodash';
import __ from 'i18n';
import context from 'context';
import advancedSearchTpl from 'ui/searchModal/tpl/advanced-search';
import textCriterionTpl from 'ui/searchModal/tpl/text-criterion';
import invalidCriteriaWarningTpl from 'ui/searchModal/tpl/invalid-criteria-warning';
import listCheckboxCriterionTpl from 'ui/searchModal/tpl/list-checkbox-criterion';
import listSelectCriterionTpl from 'ui/searchModal/tpl/list-select-criterion';
import 'ui/searchModal/css/advancedSearch.css';
import component from 'ui/component';
import 'ui/modal';
import 'ui/datatable';
import 'select2';
import urlUtil from 'util/url';
import request from 'core/dataProvider/request';

/**
 * Creates advanced search component
 *
 * @param {object} config
 * @param {object} config.renderTo - DOM element where component will be rendered to
 * @param {string} config.advancedCriteria - advanced criteria to be set on component creation
 * @returns {advancedSearch}
 */
export default function advancedSearchFactory(config) {
    // Private properties to be easily accessible by instance methods
    let $container = null;
    let $addCriteria = null;
    let $addCriteriaInput = null;
    let $criteriaSelect = null;
    let $advancedCriteriaContainer = null;
    let criteriaState = null;
    let criteriaMapping = {};
    const criteriaTypes = {
        text: 'text',
        list: 'list'
    };

    let isAdvancedSearchStatusEnabled;
    let isCriteriaListUpdated = false;

    // Creates new component
    const instance = component({
        /**
         * Request metadata (criteria) for the given uri
         * @param {string} classUri - url to make the reques to
         * @returns {Promise} - Request promise
         */
        updateCriteria: function (route) {
            if (!isAdvancedSearchStatusEnabled) {
                return Promise.resolve();
            }

            const $criteriaIcon = $('.add-criteria-container a span').eq(0);
            $criteriaIcon.toggleClass('icon-add').toggleClass('icon-loop');
            return request(route)
                .then(response => {
                    criteriaMapping = response.criteriaMapping || {};
                    const classTree = response.classDefinition ? response.classDefinition : response;
                    const criteria = formatCriteria(classTree);
                    updateCriteria(criteria);
                    isCriteriaListUpdated = true;
                    $criteriaIcon.toggleClass('icon-add').toggleClass('icon-loop');
                })
                .catch(e => instance.trigger('error', e));
        },
        /**
         * Access to component state
         * @returns {Object} - criteria state
         */
        getState: function () {
            return criteriaState;
        },
        /**
         * Removes every rendered criterion, updates criteria state accordingly
         * and removes classes applied to scrollable list of criteria
         */
        clear: function () {
            $advancedCriteriaContainer.removeClass(['scrollable', 'scroll-separator-top', 'scroll-separator-bottom']);
            $advancedCriteriaContainer.empty();
            _.forEach(criteriaState, criterion => {
                criterion.rendered = false;
                criterion.value = undefined;
            });
        },
        /**
         * Builds substring of search query with the advanced criteria conditions
         */
        getAdvancedCriteriaQuery: function (hasSearchInput) {
            const advancedSearchCriteria = _.filter(criteriaState, criterion => criterion.rendered === true);
            let query = '';

            advancedSearchCriteria.forEach(renderedCriterion => {
                const queryParam = renderedCriterion.propertyUri;
                if ((hasSearchInput || query.trim().length !== 0) && renderedCriterion.value) {
                    query += ' AND ';
                }
                if (renderedCriterion.type === criteriaTypes.text) {
                    if (renderedCriterion.value && renderedCriterion.value.trim() !== '') {
                        query += `${queryParam}:${renderedCriterion.value.trim()}`;
                    }
                } else if (renderedCriterion.type === criteriaTypes.list) {
                    if (renderedCriterion.value && renderedCriterion.value.length > 0) {
                        /* Temp replaced OR with AND. See ADF-7 for details */
                        query += `${queryParam}:${renderedCriterion.value.join(' AND ')}`;
                    }
                }
            });

            return query;
        }
    })
        .setTemplate(advancedSearchTpl)
        .on('render', () => {
            initUiSelectors();
            initAddCriteriaSelector()
                .then(() => {
                    initCriteriaState();
                    instance.trigger('ready');
                })
                .catch(e => instance.trigger('error', e));
        });

    /**
     * Inits template selectors and scroll animation
     */
    function initUiSelectors() {
        $container = instance.getElement();
        $addCriteria = $('.add-criteria-container', $container);
        $addCriteria.addClass('disabled');
        $addCriteriaInput = $('.add-criteria-container a', $container);
        $criteriaSelect = $('.add-criteria-container select', $container);
        $advancedCriteriaContainer = $('.advanced-criteria-container', $container);

        $advancedCriteriaContainer.on('scroll', _.throttle(animateScroll, 100));
    }

    /**
     * Inits select2 on criteria select and its UX logic
     */
    function initAddCriteriaSelector() {
        const route = urlUtil.route('status', 'AdvancedSearch', 'tao');
        return request(route)
            .then(function (response) {
                if (!response.enabled || context.shownStructure === 'results') {
                    isAdvancedSearchStatusEnabled = false;
                    return;
                }
                isAdvancedSearchStatusEnabled = true;
                $addCriteria.removeClass('disabled');
                $criteriaSelect.select2({
                    containerCssClass: 'criteria-select2',
                    dropdownCssClass: 'criteria-dropdown-select2',
                    sortResults: results => _.sortBy(results, ['text'])
                });

                // open dropdown when user clicks on add criteria input
                $addCriteriaInput.on('click', () => {
                    if (isCriteriaListUpdated) {
                        $criteriaSelect.select2('open');
                        // if dropdown is opened above addCriteria input, top property is slightly decreased to avoid overlapping with addCriteria icon
                        if ($('.criteria-dropdown-select2').hasClass('select2-drop-above')) {
                            $('.criteria-dropdown-select2').css(
                                'top',
                                $('.criteria-dropdown-select2').css('top').split('px')[0] - 10 + 'px'
                            );
                        }
                    }
                });

                // when a criterion is selected add it to criteria container, remove it from dropdown options and reset select
                $criteriaSelect.on('change', () => {
                    const criterionToAdd = $criteriaSelect.children('option:selected').val();
                    addNewCriterion(criterionToAdd);
                    $criteriaSelect.children('option:selected').remove();
                    $criteriaSelect.select2('val', '');
                });
            })
            .catch(function (e) {
                return instance.trigger('error', e);
            });
    }

    /**
     * inits criteriaState loading it from the store (if present) or empty object.
     * If there is a stored criteriaState, those criteria that were rendered
     * but with undefined value are updated to not being rendered
     */
    function initCriteriaState() {
        if (instance.config.advancedCriteria) {
            _.forEach(instance.config.advancedCriteria, criterion => {
                if (criterion.rendered === true && criterion.value === undefined) {
                    criterion.rendered = false;
                }
            });
        }
        criteriaState = instance.config.advancedCriteria || {};
    }

    /**
     * Styles scrolling on $advancedCriteriaContainer
     */
    function animateScroll() {
        const scrollPercentage =
            $advancedCriteriaContainer.get(0).scrollTop /
            ($advancedCriteriaContainer.get(0).scrollHeight - $advancedCriteriaContainer.get(0).clientHeight);
        if (scrollPercentage > 0.1) {
            $advancedCriteriaContainer.addClass('scroll-separator-top');
        } else {
            $advancedCriteriaContainer.removeClass('scroll-separator-top');
        }
        if (scrollPercentage < 0.9) {
            $advancedCriteriaContainer.addClass('scroll-separator-bottom');
        } else {
            $advancedCriteriaContainer.removeClass('scroll-separator-bottom');
        }
    }

    /**
     * Renders new criterion to criteria container so it can be used on advanced search filtering
     * @param {string} criterionToAdd - new criterion to be added
     */
    function addNewCriterion(criterionToAdd) {
        // remove deprecated warning message
        $('.invalid-criteria-warning-container').remove();

        // render new criterion
        const criterion = criteriaState[criterionToAdd];
        const $criterionContainer = renderCriterion(criterion);

        // set logic to remove criterion
        $('.icon-result-nok', $criterionContainer).on('click', { criterion }, removeCriterion);

        // set initial value and manage value changes
        bindCriterionValue(criterion, $criterionContainer);

        // update styles if scroll is enabled
        if ($advancedCriteriaContainer.get(0).scrollHeight > $advancedCriteriaContainer.outerHeight()) {
            $advancedCriteriaContainer.addClass('scrollable');
        }

        criterion.rendered = true;
    }

    /**
     * Renders the new criterion selecting the appropiate handlebars template and prepending to advanced criteria container.
     * If criterion is of type list with a uri endpoint to request the options, select2 is also init
     * @param {object} criterion - criterion to render
     * @returns - the rendered container
     */
    function renderCriterion(criterion) {
        let templateToUse = null;
        if (criterion.type === criteriaTypes.text) {
            templateToUse = textCriterionTpl;
        } else if (criterion.type === criteriaTypes.list && criterion.uri) {
            templateToUse = listSelectCriterionTpl;
        } else {
            templateToUse = listCheckboxCriterionTpl;
        }

        $advancedCriteriaContainer.append(templateToUse({ criterion }));

        const $criterionContainer = $(`.${criterion.id}-filter`, $container);
        const valueMapping = criteriaMapping[criterion.type];
        
        /**
         * On criterion of type list with a uri endpoint to retrieve options, template includes a select
         * that is managed with select2, so we init it here
         */
        if (criterion.type === criteriaTypes.list && criterion.uri) {
            $(`input[name=${criterion.id}-select]`, $criterionContainer).select2({
                multiple: true,
                ajax: {
                    url: criterion.uri,
                    dataType: 'json',
                    data: function (term) {
                        return {
                            subject: term
                        };
                    },
                    results: (response) => ({ 
                          results: response.data.map(option => ({ id: valueMapping === 'uri' ? option.uri : option.label, text: option.label }))
                    })
                },
                initSelection: function (element, callback) {
                    const data = [];
                    $(element.val().split(',')).each(function () {
                        data.push({ id: this, text: this });
                    });
                    callback(data);
                }
            });
        }

        return $criterionContainer;
    }

    /**
     * Fetches initial criterion label from api in case the value mapping is uri
     * @param {object} criterion - criterion to be managed
     */
    function getInitialCriterionLabel(criterion) {
        const valueMapping = criteriaMapping[criterion.type];
        if (valueMapping !== 'uri' || !criterion.value) {
            return Promise.resolve({
                id: criterion.value,
                text: criterion.value
            });
        }
        return $.ajax({
            type: 'GET',
            url: criterion.uri,
            dataType: 'json',
        }).then(({ data }) => {
            if (Array.isArray(criterion.value)) {
                return criterion.value.map(v => ({
                    id: v,
                    text: (data.find(d => d.uri === v) || {}).label
                }))
            }
            let c = (data.find(d => d.uri === criterion.value) || {})
            return {
                text: c.label,
                id: criterion.value,
            }
        })
    }

    /**
     * Sets initial value for rendered criterion and sets binding between view and state
     * @param {object} criterion - criterion to be managed
     * @param {object} $criterionContainer - rendered criterion
     */
    function bindCriterionValue(criterion, $criterionContainer) {
        getInitialCriterionLabel(criterion).then(initialCriterion => {
            if (criterion.type === criteriaTypes.text) {
                // set initial value
                $('input', $criterionContainer).val(criterion.value);
                // set event to bind input value to critariaState
                $('input', $criterionContainer).on('change', function () {
                    criterion.value = $(this).val() || undefined;
                });
            } else if (criterion.type === criteriaTypes.list && criterion.uri) {
                // set initial value
                if (criterion.value) {
                    $(`input[name=${criterion.id}-select]`, $criterionContainer).select2('data', initialCriterion);
                }
                // set event to bind input value to critariaState
                $(`input[name=${criterion.id}-select]`, $criterionContainer).on('change', event => {
                    criterion.value = event.val;
                });
            } else {
                // set initial value
                if (criterion.value) {
                    criterion.value.forEach(selectedValue => {
                        $(`input[value=${selectedValue}]`, $criterionContainer).prop('checked', true);
                    });
                }
                // set event to bind input value to critariaState
                $('input[type="checkbox"]', $criterionContainer).on('change', function () {
                    criterion.value = $(this)
                        .closest('.filter-container')
                        .find('input[type=checkbox]:checked')
                        .get()
                        .map(element => element.value);
                });
            }
        });
    }

    /**
     * Removes a criterion from advanced criteria container when user clicks on the criterion close icon.
     * It also adds the option element to criteria select so removed criterion can be rendered again
     * @param {object} event - click event triggered on closing icon
     */
    function removeCriterion(event) {
        const criterion = event.data.criterion;
        const newOption = new Option(criterion.label, criterion.label, false, false);

        // remove criterion and append new criterion to select options
        $(this).parent().remove();
        $criteriaSelect.append(newOption);

        // reset criterion values on criteriaState
        criteriaState[criterion.label].rendered = false;
        criteriaState[criterion.label].value = undefined;

        // check if advanced criteria container is no longer scrollable
        if ($advancedCriteriaContainer.get(0).scrollHeight <= $advancedCriteriaContainer.outerHeight()) {
            $advancedCriteriaContainer.removeClass('scrollable');
        }
    }

    /**
     * Parses received criteria from BE to the data structure required for criteria selector. To do so,
     * appends every criterion into criteria array and then returns a duplicate-free version of it
     * considering label property as uniqueness criterion
     * @param {Array} classes - array of classes with the metadata (aka criteria) for each one of them
     * @returns {Array} - criteria array
     */
    function formatCriteria(classTree) {
        let criteria = [];

        _.forEach(classTree, classInstance => {
            criteria.push(...classInstance.metadata);
        });

        criteria = _.uniq(criteria, 'label');

        // extends each criterion with an id that can be use as a valid css class
        _.forEach(criteria, criterion => (criterion.id = criterion.label.replace(/^[^a-zA-Z]*|[^a-zA-Z0-9]*/g, '')));

        return criteria;
    }

    /**
     * Manages the new set of available criteria. To do so, removes warning container and every
     * selectable criterion. Then removes from criteriaState and view every deprecated criterion,
     * updates criteriaState with the new available criteria set, and renders new warning
     * message if required
     * @param {array} criteria - array of class properties
     */
    function updateCriteria(criteria) {
        $('.invalid-criteria-warning-container').remove();
        $criteriaSelect.find('option:not(:first-child)').remove();
        const invalidCriteria = deleteDeprecatedCriteria(criteria);
        extendCriteria(criteria);
        renderWarningMessage(invalidCriteria);
    }

    /**
     * If there is any invalid criterion, renders an explanatory warning message
     * @param {array} invalidCriteria - array of string containing the label of every invalid criterion (those that were rendered but are no longer available)
     */
    function renderWarningMessage(invalidCriteria) {
        if (invalidCriteria.length > 0) {
            const invalidCriteriaWarning = invalidCriteriaWarningTpl({ invalidCriteria });
            $advancedCriteriaContainer.prepend(invalidCriteriaWarning);
            $('.invalid-criteria-warning-container .select2-search-choice-close', $advancedCriteriaContainer).on(
                'click',
                function () {
                    $(this).parent().remove();
                }
            );
        }
    }

    /**
     * Loops through current criteriaState so every criterion that is no longer available in the new
     * available criteria set is removed from criteriaState and from view, in case it had been
     * rendered. In that case it is also pushed into invalidCriteria array to be latter
     * included in the warning message
     * @param {array} criteria - array containing new set of criteria for current class
     * @returns {array} - array of strings with each deprecated criterion that was being displayed
     */
    function deleteDeprecatedCriteria(criteria) {
        const invalidCriteria = [];

        _.forEach(criteriaState, oldCriterion => {
            const deprecatedCriterion = !criteria.find(newCriterion => newCriterion.label === oldCriterion.label);
            if (deprecatedCriterion) {
                if (criteriaState[oldCriterion.label].rendered) {
                    $advancedCriteriaContainer.find(`.${oldCriterion.id}-filter`).remove();
                    invalidCriteria.push(oldCriterion.label);
                }
                delete criteriaState[oldCriterion.label];
            }
        });

        return invalidCriteria;
    }

    /**
     * Loops through new criteria set and checks if each new criterion was already present or not on criteriaState
     * and updates view and selectable criteria list accordingly
     * @param {array} criteria - array containing new set of criteria for current class
     */
    function extendCriteria(criteria) {
        criteria.forEach(criterion => {
            let createOption = true;

            // if new criterion was already on criteriaState and had to be rendered, we avoid creating an option for it and render it if it was not
            if (criteriaState[criterion.label] && criteriaState[criterion.label].rendered === true) {
                createOption = false;

                if ($advancedCriteriaContainer.find(`.${criterion.id}-filter`).length === 0) {
                    addNewCriterion(criterion.label);
                }
            } else {
                // if new criterion was not on criteriaState we add it
                criteriaState[criterion.label] = criterion;
                criteriaState[criterion.label].rendered = false;
                criteriaState[criterion.label].value = undefined;
            }

            // create new option element to criteria select
            if (createOption) {
                const newOption = new Option(criterion.label, criterion.label, false, false);
                $criteriaSelect.append(newOption);
            }
        });
    }

    // return initialized instance of searchModal
    return instance.init(config);
}
